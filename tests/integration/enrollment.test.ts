import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	setEnrollment,
	getEnrollment,
	requestEnrollment,
	reviewEnrollment,
	enrollmentAdmin
} from '../../src/lib/server/domain/enrollment.ts';
import { closePool, cleanPool } from '../../src/lib/server/domain/pool.ts';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-28T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'enrollment test' };
let admin: User, student: User, other: User, code: string;
let messages: RealtimeEvent[], stop: () => void;
async function reset() {
	await client`TRUNCATE enrollment_requests, whitelist, users, events, pools, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET enrollment_code=null,pool_start='2026-10-19',pool_end='2026-11-15',pool_closed_at=null,pool_reopened=false WHERE id=1`;
}
beforeEach(async () => {
	await reset();
	[admin, student, other] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'staff', role: 'admin' },
			{ intraId: 2, login: 'student' },
			{ intraId: 3, login: 'other' }
		])
		.returning();
	messages = [];
	stop = subscribe((message) => messages.push(message));
	await setEnrollment(database, admin, { open: 'yes' }, info, now);
	code = (await client`SELECT enrollment_code FROM settings`)[0].enrollment_code;
});
afterEach(() => stop());
afterAll(async () => {
	await reset();
	await client.end();
});
const request = (user = student, weeks: unknown = [1, 3]) =>
	requestEnrollment(database, user, { code, weeks }, info, now);

it('requires both dates, keeps the same code while open, invalidates old codes and rotates on reopening', async () => {
	expect(code).toMatch(/^[a-f0-9]{48}$/);
	await setEnrollment(database, admin, { open: 'yes' }, info, now);
	expect((await client`SELECT enrollment_code FROM settings`)[0].enrollment_code).toBe(code);
	const qr = await enrollmentAdmin(database, admin, 'https://example.test');
	expect(qr.url).toBe(`https://example.test/join/${code}`);
	expect(qr.qr).toMatch(/^data:image\/svg\+xml;base64,/);
	expect(await getEnrollment(database, code, null)).toMatchObject({ state: 'ready' });
	await setEnrollment(database, admin, { open: 'no' }, info, now);
	expect(await getEnrollment(database, code, null)).toMatchObject({ state: 'closed' });
	expect((await request()).messages[0].key).toBe('enrollment_closed');
	await setEnrollment(database, admin, { open: 'yes' }, info, now);
	expect((await client`SELECT enrollment_code FROM settings`)[0].enrollment_code).not.toBe(code);
	for (const column of ['pool_start', 'pool_end']) {
		await setEnrollment(database, admin, { open: 'no' }, info, now);
		await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15'`;
		await client`UPDATE settings SET ${client(column)}=null`;
		expect((await setEnrollment(database, admin, { open: 'yes' }, info, now)).ok).toBe(false);
		expect((await client`SELECT enrollment_code FROM settings`)[0].enrollment_code).toBeNull();
	}
});
it('rejects a wrong code and never exposes the active code to a public caller', async () => {
	expect(await getEnrollment(database, 'wrong', student)).toEqual({
		state: 'closed',
		poolStart: null
	});
	expect(
		(await requestEnrollment(database, student, { code: 'wrong', weeks: [1] }, info, now)).ok
	).toBe(false);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	expect(await getEnrollment(database, code, null)).toEqual({
		state: 'ready',
		poolStart: '2026-10-19'
	});
});
it.each(
	[[], [0], [5], ['bad'], [1, 1], [1, 2, 3, 4, 1], undefined, null].map((weeks) => ({ weeks }))
)('rejects invalid weeks $weeks without writes', async ({ weeks }) => {
	await expect(requestEnrollment(database, student, { code, weeks }, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	expect(
		await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_REQUEST'`
	).toHaveLength(0);
});
it('accepts HTML week strings, sorts them, audits them, and deduplicates concurrent requests', async () => {
	const results = await Promise.all([request(student, ['4', '1']), request(student, ['2'])]);
	expect(results.filter((result) => result.ok)).toHaveLength(1);
	const rows = await client`SELECT * FROM enrollment_requests`;
	expect(rows).toHaveLength(1);
	const expectedWeeks = results[0].ok ? [1, 4] : [2];
	expect(rows[0].weeks).toEqual(expectedWeeks);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	const logs = await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_REQUEST'`;
	expect(logs).toHaveLength(1);
	expect(logs[0]).toMatchObject({
		actor_login: 'student',
		new_value: { login: 'student', weeks: expectedWeeks }
	});
	expect(await getEnrollment(database, code, student)).toMatchObject({ state: 'waiting' });
	expect((await request()).messages[0].key).toBe('enrollment_waiting');
});
it('recognizes approved logins and keeps manual additions without weeks', async () => {
	await database.insert(schema.whitelist).values({ login: student.login, addedAt: now });
	expect((await request()).messages[0].key).toBe('enrollment_already_in');
	expect(await getEnrollment(database, code, student)).toMatchObject({ state: 'approved' });
	expect((await client`SELECT * FROM whitelist`)[0].weeks).toBeNull();
	expect(
		(await enrollmentAdmin(database, admin, 'https://example.test')).weeks.every(
			(week) => !week.people.length
		)
	).toBe(true);
});
it('approves selected logins atomically, carries weeks, and counts received requests after review', async () => {
	await request();
	await request(other, [2, 3]);
	const before = await enrollmentAdmin(database, admin, 'https://example.test');
	expect(before.received).toBe(2);
	expect(before.weeks[2].people).toEqual([
		{ login: 'other', state: 'waiting' },
		{ login: 'student', state: 'waiting' }
	]);
	await reviewEnrollment(database, admin, { logins: ['student'], decision: 'approve' }, info, now);
	expect((await client`SELECT * FROM whitelist`)[0]).toMatchObject({
		login: 'student',
		weeks: [1, 3]
	});
	expect((await client`SELECT * FROM enrollment_requests`).map((row) => row.login)).toEqual([
		'other'
	]);
	const after = await enrollmentAdmin(database, admin, 'https://example.test');
	expect(after.received).toBe(2);
	expect(after.weeks[2].people).toEqual([
		{ login: 'other', state: 'waiting' },
		{ login: 'student', state: 'approved' }
	]);
	await reviewEnrollment(database, admin, { logins: ['other'], decision: 'approve' }, info, now);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_ADD'`).toHaveLength(2);
});
it('rejects selected batches with one audit per login', async () => {
	await request();
	await request(other);
	await reviewEnrollment(
		database,
		admin,
		{ logins: ['other', 'student'], decision: 'reject' },
		info,
		now
	);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_REJECT'`).toHaveLength(
		2
	);
	expect((await enrollmentAdmin(database, admin, 'https://example.test')).received).toBe(2);
	await request();
	await request(other);
	await reviewEnrollment(
		database,
		admin,
		{ logins: ['student', 'other'], decision: 'reject' },
		info,
		now
	);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
});
it.each(['approve', 'reject'])(
	'rolls back the whole %s batch on audit failure and emits no events',
	async (decision) => {
		await request();
		await request(other);
		const before = await client`SELECT * FROM enrollment_requests ORDER BY login`;
		messages.length = 0;
		await client`ALTER TABLE action_logs ADD CONSTRAINT test_enrollment_audit CHECK (actor_login <> 'staff' OR resource_id <> 'student')`;
		// Approval audits refer to whitelist ids; reject all staff writes for that case.
		if (decision === 'approve') {
			await client`ALTER TABLE action_logs DROP CONSTRAINT test_enrollment_audit`;
			await client`ALTER TABLE action_logs ADD CONSTRAINT test_enrollment_audit CHECK (action_type <> 'WHITELIST_ADD' OR new_value->>'login' <> 'student')`;
		}
		try {
			await expect(
				reviewEnrollment(database, admin, { logins: ['student', 'other'], decision }, info, now)
			).rejects.toThrow();
			expect(await client`SELECT * FROM enrollment_requests ORDER BY login`).toEqual(before);
			expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
			expect(messages).toEqual([]);
		} finally {
			await client`ALTER TABLE action_logs DROP CONSTRAINT test_enrollment_audit`;
		}
	}
);
it.each([null, 'user', 'revoked'] as const)('guards admin operations (%s)', async (role) => {
	const actor = role === 'revoked' ? { ...student, role: 'admin' as const } : role ? student : null;
	for (const call of [
		() => setEnrollment(database, actor, { open: 'no' }, info, now),
		() => reviewEnrollment(database, actor, { logins: ['student'], decision: 'approve' }, info, now)
	])
		await expect(call()).rejects.toMatchObject({ status: role ? 403 : 401 });
	if (role !== 'revoked')
		await expect(enrollmentAdmin(database, actor, 'https://example.test')).rejects.toMatchObject({
			status: role ? 403 : 401
		});
});
it('requires authentication and rechecks the account before accepting requests', async () => {
	await expect(
		requestEnrollment(database, null, { code, weeks: [1] }, info, now)
	).rejects.toMatchObject({ status: 401 });
	await client`DELETE FROM users WHERE id=${student.id}`;
	await expect(request()).rejects.toMatchObject({ status: 401 });
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
});
it('cleans pending requests only with whitelist, records the snapshot, and rolls back on cleanup audit failure', async () => {
	await request();
	await closePool(database, admin, { confirm: 'yes' }, info, now);
	await cleanPool(database, admin, { confirm: 'yes', save: 'no', weeks: 'yes' }, info, now);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(1);
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_enrollment_cleanup CHECK (action_type <> 'CLEAN_POOL') NOT VALID`;
	try {
		expect(
			(
				await cleanPool(
					database,
					admin,
					{ confirm: 'yes', save: 'no', whitelist: 'yes' },
					info,
					now
				)
			).ok
		).toBe(false);
		expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(1);
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_enrollment_cleanup`;
	}
	await cleanPool(database, admin, { confirm: 'yes', save: 'no', whitelist: 'yes' }, info, now);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	const [log] =
		await client`SELECT old_value FROM action_logs WHERE action_type='CLEAN_POOL' ORDER BY id DESC LIMIT 1`;
	expect(log.old_value.enrollmentRequests[0]).toMatchObject({ login: 'student', weeks: [1, 3] });
});

it('approval keeps the requested weeks if staff has also added the waiting login manually', async () => {
	await request();
	await database.insert(schema.whitelist).values({ login: student.login, addedAt: now });
	await reviewEnrollment(
		database,
		admin,
		{ logins: [student.login], decision: 'approve' },
		info,
		now
	);
	expect((await client`SELECT * FROM whitelist`)[0].weeks).toEqual([1, 3]);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
});

it('approves a complete selected batch with one audit per login and each set of weeks', async () => {
	await request();
	await request(other, [2, 4]);
	await reviewEnrollment(
		database,
		admin,
		{ logins: ['other', 'student'], decision: 'approve' },
		info,
		now
	);
	expect(
		(await client`SELECT login,weeks FROM whitelist ORDER BY login`).map((row) => ({ ...row }))
	).toEqual([
		{ login: 'other', weeks: [2, 4] },
		{ login: 'student', weeks: [1, 3] }
	]);
	expect(await client`SELECT * FROM enrollment_requests`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_ADD'`).toHaveLength(2);
});
it('writes the same English log description whatever the UI locale is', async () => {
	const seen: string[] = [];
	for (const locale of ['it', 'en', 'fr'] as const) {
		overwriteGetLocale(() => locale);
		await client`DELETE FROM action_logs`;
		await setEnrollment(database, admin, { open: 'no' }, info, now);
		await setEnrollment(database, admin, { open: 'yes' }, info, now);
		const code = (await client`SELECT enrollment_code FROM settings`)[0].enrollment_code;
		await requestEnrollment(database, student, { code, weeks: [1] }, info, now);
		await reviewEnrollment(database, admin, { logins: ['student'], decision: 'reject' }, info, now);
		seen.push(
			(await client`SELECT description FROM action_logs ORDER BY id`)
				.map((row) => row.description)
				.join('|')
		);
	}
	expect(seen[0]).toBe(
		'Enrollment closed|Enrollment opened|Pool enrollment request from student.|Rejected the request from student.'
	);
	expect(seen[1]).toBe(seen[0]);
	expect(seen[2]).toBe(seen[0]);
});
