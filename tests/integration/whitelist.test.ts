import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	listWhitelist,
	addLogins,
	removeLogin,
	suggestLogins
} from '../../src/lib/server/domain/whitelist.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';
import { register, unregister } from '../../src/lib/server/domain/registrations.ts';

const intra = vi.hoisted(() => ({
	lookup: vi.fn<(logins: string[]) => Promise<Map<string, string>>>()
}));
vi.mock('../../src/lib/server/intra.ts', () => ({ lookupIntraLogins: intra.lookup }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-20T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'whitelist test' };
let admin: User, user: User, messages: RealtimeEvent[], stop: () => void;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	intra.lookup.mockReset();
	intra.lookup.mockImplementation(async (logins) => new Map(logins.map((l) => [l, 'ok'])));
	await truncate();
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,max_events_per_user=0 WHERE id=1`;
	[admin, user] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'staff', role: 'admin' },
			{ intraId: 2, login: 'student', role: 'user' }
		])
		.returning();
	messages = [];
	stop = subscribe((message) => messages.push(message));
});
afterEach(() => stop());
afterAll(async () => {
	await truncate();
	await client.end();
});

it('lists by login, includes insertion dates, and handles an empty whitelist', async () => {
	expect(await listWhitelist(database, admin)).toEqual([]);
	await addLogins(database, admin, { logins: 'zeta alpha' }, info, now);
	const rows = await listWhitelist(database, admin);
	expect(rows.map((row) => row.login)).toEqual(['alpha', 'zeta']);
	expect(rows.map((row) => row.addedAt)).toEqual([now, now]);
});
it('splits all separators, normalizes logins, skips invalid entries and warns on duplicates', async () => {
	await database.insert(schema.whitelist).values({ login: 'existing' });
	const result = await addLogins(
		database,
		admin,
		{
			logins:
				'  ZETA, Alpha\nexisting\tALPHA\r\nunder_score dash-name, <img> ;bad ' + 'x'.repeat(33)
		},
		info,
		now
	);
	expect(result).toEqual({
		ok: true,
		messages: [
			{
				type: 'success',
				key: 'whitelist_added',
				params: { logins: 'alpha, dash-name, under_score, zeta' }
			},
			{ type: 'warning', key: 'whitelist_duplicates', params: { logins: 'existing' } },
			{
				type: 'warning',
				key: 'whitelist_invalid',
				params: { logins: '<img>, ;bad, ' + 'x'.repeat(33) }
			}
		]
	});
	const logs = await database.select().from(schema.actionLogs).orderBy(schema.actionLogs.id);
	expect(logs).toHaveLength(4);
	expect(
		logs.every(
			(log) =>
				log.actionType === 'WHITELIST_ADD' &&
				log.actorUserId === admin.id &&
				log.resourceType === 'whitelist' &&
				log.ipAddress === info.ipAddress
		)
	).toBe(true);
	expect(logs.map((log) => log.newValue)).toEqual(['alpha', 'dash-name', 'under_score', 'zeta']);
	expect(messages).toEqual(logs.map((log) => ({ type: 'log_created', id: log.id })));
});
it('accepts one- and 32-character logins and never requires a user account', async () => {
	await addLogins(database, admin, { logins: 'a ' + 'x'.repeat(32) }, info, now);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(2);
	expect(await client`SELECT * FROM users`).toHaveLength(2);
});
it('reports only invalid tokens without mutations or audit', async () => {
	const result = await addLogins(database, admin, { logins: 'bad! <script>' }, info, now);
	expect(result).toMatchObject({
		ok: false,
		messages: [{ type: 'warning', key: 'whitelist_invalid' }]
	});
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it('duplicate-only batches preserve the date and emit no extra logs or notifications', async () => {
	await addLogins(database, admin, { logins: 'existing' }, info, now);
	messages.length = 0;
	const result = await addLogins(
		database,
		admin,
		{ logins: 'EXISTING existing' },
		info,
		new Date()
	);
	expect(result).toEqual({
		ok: false,
		messages: [{ type: 'warning', key: 'whitelist_duplicates', params: { logins: 'existing' } }]
	});
	expect((await listWhitelist(database, admin))[0].addedAt).toEqual(now);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
	expect(messages).toEqual([]);
});
it('removes by id with exact audit while preserving all existing registrations', async () => {
	await addLogins(database, admin, { logins: user.login }, info, now);
	const [row] = await listWhitelist(database, admin);
	const [event] = await database
		.insert(schema.events)
		.values({ title: 'Future', week: 1, weekday: 1, startTime: '09:00', endTime: '10:00' })
		.returning();
	await register(database, user, { id: event.id }, info, now);
	messages.length = 0;
	expect(await removeLogin(database, admin, { id: String(row.id) }, info)).toEqual({
		ok: true,
		messages: [{ type: 'success', key: 'whitelist_removed', params: { logins: user.login } }]
	});
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	const [log] = await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_REMOVE'`;
	expect(log).toMatchObject({
		actor_user_id: admin.id,
		resource_id: String(row.id),
		old_value: user.login,
		resource_type: 'whitelist'
	});
	expect(messages).toEqual([{ type: 'log_created', id: Number(log.id) }]);
	expect((await register(database, user, { id: event.id }, info, now)).messages[0].key).toBe(
		'error_not_whitelisted'
	);
	expect((await unregister(database, user, { id: event.id }, info, now)).ok).toBe(true);
});
it('returns 404 without logs or notifications for a missing id', async () => {
	await expect(removeLogin(database, admin, { id: 999 }, info)).rejects.toMatchObject({
		status: 404
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it.each([null, 'user'] as const)(
	'guards list and mutations before input validation for %s',
	async (role) => {
		const actor = role ? user : null;
		for (const call of [
			() => listWhitelist(database, actor),
			() => addLogins(database, actor, {}, info, now),
			() => removeLogin(database, actor, {}, info)
		])
			await expect(call()).rejects.toMatchObject({ status: role ? 403 : 401 });
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	}
);
it.each([addLogins, removeLogin])(
	'rechecks the admin role inside the transaction (%s)',
	async (mutate) => {
		await expect(
			mutate(
				database,
				{ ...user, role: 'admin' },
				mutate === addLogins ? { logins: 'new' } : { id: 1 },
				info,
				now
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	}
);
it.each([
	[addLogins, {}],
	[addLogins, { logins: ' , \n ' }],
	[addLogins, { logins: 123 }],
	[addLogins, { logins: 'good', extra: true }],
	[removeLogin, { id: 0 }],
	[removeLogin, { id: 2147483648 }],
	[removeLogin, { id: 'invalid' }],
	[removeLogin, { id: 1, extra: true }]
])('rejects invalid envelopes without writes (%s)', async (mutate, input) => {
	await expect(mutate(database, admin, input, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it('overlapping reversed batches from different admins insert and audit each login only once', async () => {
	const [other] = await database
		.insert(schema.users)
		.values({ intraId: 3, login: 'other', role: 'admin' })
		.returning();
	const results = await Promise.all([
		addLogins(database, admin, { logins: 'zeta alpha beta' }, info, now),
		addLogins(database, other, { logins: 'beta alpha zeta' }, info, now)
	]);
	expect(results.filter((result) => result.ok)).toHaveLength(1);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(3);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(3);
	expect(messages).toHaveLength(3);
});
it.each(['add', 'remove'] as const)(
	'rolls back the complete %s transaction if audit fails',
	async (operation) => {
		await database.insert(schema.whitelist).values({ login: 'existing' });
		const before = await client`SELECT * FROM whitelist`;
		if (operation === 'add')
			await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_whitelist CHECK (action_type='LOGIN' OR (action_type='WHITELIST_ADD' AND new_value <> '"zeta"'::jsonb))`;
		else
			await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_whitelist CHECK (action_type='LOGIN')`;
		try {
			await expect(
				operation === 'add'
					? addLogins(database, admin, { logins: 'alpha zeta' }, info, now)
					: removeLogin(database, admin, { id: before[0].id }, info)
			).rejects.toThrow();
			expect(await client`SELECT * FROM whitelist`).toEqual(before);
			expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
			expect(messages).toEqual([]);
		} finally {
			await client`ALTER TABLE action_logs DROP CONSTRAINT test_reject_whitelist`;
		}
	}
);
it('adds only logins verified on Intra, reports the others and checks only new logins', async () => {
	await database.insert(schema.whitelist).values({ login: 'existing' });
	intra.lookup.mockResolvedValueOnce(
		new Map([
			['fine', 'ok'],
			['ghost', 'missing'],
			['other', 'other_campus'],
			['later', 'unavailable']
		])
	);
	const result = await addLogins(
		database,
		admin,
		{ logins: 'fine ghost other later existing' },
		info,
		now
	);
	expect(intra.lookup).toHaveBeenCalledExactlyOnceWith(['fine', 'ghost', 'later', 'other']);
	expect(result).toEqual({
		ok: true,
		messages: [
			{ type: 'success', key: 'whitelist_added', params: { logins: 'fine' } },
			{ type: 'warning', key: 'whitelist_duplicates', params: { logins: 'existing' } },
			{ type: 'warning', key: 'whitelist_not_found', params: { logins: 'ghost' } },
			{ type: 'warning', key: 'whitelist_other_campus', params: { logins: 'other' } },
			{ type: 'error', key: 'whitelist_unavailable', params: { logins: 'later' } }
		]
	});
	expect((await client`SELECT login FROM whitelist ORDER BY login`).map((r) => r.login)).toEqual([
		'existing',
		'fine'
	]);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it('does not call Intra for invalid or already listed logins', async () => {
	await database.insert(schema.whitelist).values({ login: 'existing' });
	await addLogins(database, admin, { logins: 'existing bad!' }, info, now);
	expect(intra.lookup).toHaveBeenCalledExactlyOnceWith([]);
});
it('suggests whitelisted logins by substring with names and image flags, admin only', async () => {
	await database
		.insert(schema.whitelist)
		.values([{ login: 'mrossi' }, { login: 'xmrosa' }, { login: 'zed_1' }, { login: 'zedx1' }]);
	await client`UPDATE users SET display_name='Zed Zeta', image_url='https://cdn.intra.42.fr/a.jpg' WHERE login='student'`;
	await database.insert(schema.whitelist).values({ login: 'student' });
	expect(await suggestLogins(database, admin, 'MRO')).toEqual([
		{ login: 'mrossi', name: null, hasImage: false },
		{ login: 'xmrosa', name: null, hasImage: false }
	]);
	expect((await suggestLogins(database, admin, 'zeta')).map((r) => r.login)).toEqual(['student']);
	expect((await suggestLogins(database, admin, 'stud'))[0]).toMatchObject({ hasImage: true });
	expect((await suggestLogins(database, admin, 'zed_')).map((r) => r.login)).toEqual(['zed_1']);
	expect(await suggestLogins(database, admin, 'no match!')).toEqual([]);
	await expect(suggestLogins(database, user, 'm')).rejects.toMatchObject({ status: 403 });
});
