import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	getArchive,
	getPoolPhase,
	exportArchive,
	importPool,
	previewPoolImport,
	ARCHIVE_COLUMNS
} from '../../src/lib/server/domain/archive.ts';
import { closePool } from '../../src/lib/server/domain/pool.ts';
import { writeCsv } from '../../src/lib/server/domain/csv.ts';
import { actions } from '../../src/routes/admin/archive/+page.server.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const info = { ipAddress: '127.0.0.1', userAgent: 'archive test' };
const now = new Date('2026-10-27T10:00:00Z');
const row = (login: string, over: Record<number, string | number> = {}) =>
	[login, 'Exam', 'exam', '2025-05-05', 1, '09:00', '10:30', 90, 200, 'true', '', 1, 4, '', ''].map(
		(cell, i) => over[i] ?? cell
	);
const csv = writeCsv([
	[...ARCHIVE_COLUMNS],
	row('student'),
	row('student', { 1: 'Rush', 2: 'rush', 3: '2025-05-06', 4: 2, 9: 'false', 8: 0, 7: 60 }),
	row('second', { 1: 'Cluster', 2: 'cluster', 7: 120, 8: 100 }),
	row('Bad Login')
]);
const input = {
	start: '2025-05-01',
	end: '2025-05-31',
	csv: Buffer.from(csv).toString('base64'),
	confirmed: 'yes'
};
let actor: User, messages: RealtimeEvent[], unsubscribe: () => void;
async function snapshot() {
	return {
		pools: await client`SELECT * FROM pools ORDER BY id`,
		entries: await client`SELECT * FROM pool_entries ORDER BY id`,
		logs: await client`SELECT * FROM action_logs ORDER BY id`,
		settings: await client`SELECT * FROM settings`,
		events: await client`SELECT * FROM events ORDER BY id`,
		registrations: await client`SELECT * FROM registrations ORDER BY id`,
		whitelist: await client`SELECT * FROM whitelist ORDER BY id`,
		templates: await client`SELECT * FROM week_templates ORDER BY id`
	};
}
beforeEach(async () => {
	await client`TRUNCATE pools, week_activations, users, events, registrations, week_templates, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start='2026-10-19',pool_end='2026-11-15',active_week=1,display_week=1 WHERE id=1`;
	[actor] = await database
		.insert(schema.users)
		.values({ intraId: 42, login: 'archive_admin', role: 'admin' })
		.returning();
	await client`INSERT INTO events (title,kind,week,weekday,start_time,end_time,compensation) VALUES ('Current exam','exam',1,1,'09:00','10:00',200)`;
	await client`INSERT INTO registrations (event_id,participant_login) VALUES (1,'student')`;
	messages = [];
	unsubscribe = subscribe((message) => messages.push(message));
});
afterEach(() => unsubscribe());
afterAll(async () => {
	await client`TRUNCATE pools, week_activations, users, events, registrations, week_templates, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=1 WHERE id=1`;
	await client.end();
});

it('previews source bytes, skipped reasons and shared totals without writing anything', async () => {
	const before = await snapshot();
	const preview = await previewPoolImport(database, actor, {
		start: input.start,
		end: input.end,
		file: new File([csv], 'archive.csv')
	});
	expect(preview).toMatchObject({
		start: input.start,
		end: input.end,
		csv: input.csv,
		preview: {
			rowsRead: 4,
			count: 3,
			skipped: [{ line: 5, reason: 'archive_skip_invalid', column: 'login' }],
			totals: { taken: 3, completed: 2, hours: 3.5, altarian: 300, participants: 2 }
		}
	});
	expect(await snapshot()).toEqual(before);
	expect(messages).toEqual([]);
});

it('imports only readable entries and writes one audit log atomically without changing the current pool', async () => {
	const before = await snapshot();
	expect(await importPool(database, actor, input, info, now)).toMatchObject({ ok: true });
	const after = await snapshot();
	expect(after.pools).toHaveLength(1);
	expect(after.pools[0]).toMatchObject({
		start_date: '2025-05-01',
		end_date: '2025-05-31',
		source: 'csv'
	});
	expect(new Date(after.pools[0].archived_at)).toEqual(now);
	expect(after.entries).toHaveLength(3);
	expect(after.entries[0]).toMatchObject({
		login: 'student',
		kind: 'exam',
		event_date: '2025-05-05',
		weekday: 1,
		start_time: '09:00:00',
		end_time: '10:30:00',
		duration_minutes: 90,
		compensation: 200,
		attended: true,
		registered_at: null,
		week: 1,
		max_slots: 4,
		event_ref: null,
		week_activated_at: null
	});
	expect(after.entries[1]).toMatchObject({ attended: false, compensation: 0 });
	expect(after.logs).toHaveLength(1);
	expect(after.logs[0]).toMatchObject({
		action_type: 'IMPORT_POOL',
		actor_login: actor.login,
		ip_address: info.ipAddress,
		user_agent: info.userAgent,
		resource_type: 'pool',
		resource_id: String(after.pools[0].id),
		new_value: { archiveId: Number(after.pools[0].id), entries: 3 }
	});
	expect(messages).toEqual([{ type: 'log_created', id: Number(after.logs[0].id) }]);
	for (const table of ['settings', 'events', 'registrations', 'whitelist', 'templates'] as const)
		expect(after[table]).toEqual(before[table]);
});

it.each(['csv', 'site'] as const)(
	'rejects an existing %s pool without changing any rows or logs',
	async (source) => {
		await database
			.insert(schema.pools)
			.values({ startDate: '2025-05-01', source, archivedAt: now });
		const before = await snapshot();
		expect(await importPool(database, actor, input, info, now)).toMatchObject({
			ok: false,
			status: 400,
			messages: [{ key: 'archive_duplicate' }]
		});
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	}
);

it('allows exactly one concurrent import for a start date', async () => {
	const results = await Promise.all([
		importPool(database, actor, input, info, now),
		importPool(database, actor, input, info, now)
	]);
	expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
	expect((await snapshot()).entries).toHaveLength(3);
	expect(messages).toHaveLength(1);
});

it.each(['entries', 'audit'])('rolls back all archive writes if %s fails', async (stage) => {
	const before = await snapshot();
	if (stage === 'entries')
		await client`ALTER TABLE pool_entries ADD CONSTRAINT test_archive_failure CHECK (login <> 'second')`;
	else
		await client`ALTER TABLE action_logs ADD CONSTRAINT test_archive_failure CHECK (action_type <> 'IMPORT_POOL')`;
	try {
		await expect(importPool(database, actor, input, info, now)).rejects.toThrow();
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	} finally {
		if (stage === 'entries')
			await client`ALTER TABLE pool_entries DROP CONSTRAINT test_archive_failure`;
		else await client`ALTER TABLE action_logs DROP CONSTRAINT test_archive_failure`;
	}
});

it('rejects unauthorized and revoked administrators and validates confirmation independently', async () => {
	const before = await snapshot();
	await expect(getArchive(database, null, {})).rejects.toMatchObject({ status: 401 });
	await expect(previewPoolImport(database, { ...actor, role: 'user' }, {})).rejects.toMatchObject({
		status: 403
	});
	await expect(importPool(database, null, input, info, now)).rejects.toMatchObject({ status: 401 });
	await expect(
		importPool(database, { ...actor, role: 'user' }, input, info, now)
	).rejects.toMatchObject({ status: 403 });
	for (const invalid of [
		{ ...input, confirmed: undefined },
		{ ...input, start: '2025-13-01' },
		{ ...input, end: '2025-04-30' },
		{ ...input, csv: '!!!!' },
		{ ...input, csv: Buffer.from('bad').toString('base64') }
	])
		await expect(importPool(database, actor, invalid, info, now)).rejects.toThrow();
	await client`UPDATE users SET role='user' WHERE id=${actor.id}`;
	await expect(importPool(database, actor, input, info, now)).rejects.toMatchObject({
		status: 403
	});
	expect(await snapshot()).toEqual(before);
	expect(messages).toEqual([]);
});

it('rejects a wrong header with a notice and writes nothing', async () => {
	const before = await snapshot();
	const file = new File([csv.replace('login', 'user')], 'archive.csv');
	expect(
		await previewPoolImport(database, actor, { start: input.start, end: input.end, file })
	).toMatchObject({ ok: false, status: 400, messages: [{ key: 'archive_bad_header' }] });
	await expect(
		importPool(
			database,
			actor,
			{ ...input, csv: Buffer.from(csv.replace('login', 'user')).toString('base64') },
			info,
			now
		)
	).rejects.toThrow();
	expect(await snapshot()).toEqual(before);
});

it('does not create an empty archive when all rows are skipped', async () => {
	const empty = Buffer.from(writeCsv([[...ARCHIVE_COLUMNS], row('Bad Login')])).toString('base64');
	const before = await snapshot();
	expect(await importPool(database, actor, { ...input, csv: empty }, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'archive_import_empty' }]
	});
	expect(await snapshot()).toEqual(before);
});

it('exports an archived pool and re-imports identical rows (round trip)', async () => {
	await client`INSERT INTO week_activations (week,activated_at) VALUES (1,'2026-10-19T07:00:00Z')`;
	await closePool(database, actor, { confirm: 'yes' }, info, now);
	const stored = await client`SELECT * FROM pool_entries ORDER BY id`;
	const { startDate, csv: exported } = await exportArchive(database, actor, { pool: '1' });
	expect(startDate).toBe('2026-10-19');
	expect((await exportArchive(database, actor, { pool: 'current' })).csv).toBe(exported);
	await importPool(
		database,
		actor,
		{
			start: '2030-01-01',
			end: '2030-01-31',
			confirmed: 'yes',
			csv: Buffer.from(exported).toString('base64')
		},
		info,
		now
	);
	const copied = await client`SELECT * FROM pool_entries WHERE pool_id=2 ORDER BY id`;
	const strip = (row: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id' && key !== 'pool_id'));
	expect(copied.map(strip)).toEqual(stored.map(strip));
	expect((await exportArchive(database, actor, { pool: '2' })).csv).toBe(exported);
	await expect(exportArchive(database, actor, { pool: '99' })).rejects.toMatchObject({
		status: 404
	});
	await expect(exportArchive(database, null, { pool: 'current' })).rejects.toMatchObject({
		status: 401
	});
});

it('lists years and pools and uses the same totals for current and archived pools without duplication', async () => {
	let page = await getArchive(database, actor, {});
	expect(page).toMatchObject({
		years: ['2026'],
		selected: { key: 'current' },
		totals: { taken: 1, hours: 1, altarian: 200 },
		participants: [{ login: 'student', taken: 1, completed: 1 }]
	});
	const currentTotals = page.totals;
	await closePool(database, actor, { confirm: 'yes' }, info, now);
	await importPool(database, actor, input, info, now);
	page = await getArchive(database, actor, {});
	expect(page.years).toEqual(['2026', '2025']);
	expect(page.choices).toHaveLength(1);
	expect(page.choices[0].current).toBe(false);
	expect(page.totals).toEqual(currentTotals);
	page = await getArchive(database, actor, { year: '2025' });
	expect(page).toMatchObject({
		totals: { taken: 3, completed: 2, hours: 3.5, altarian: 300 },
		participants: [
			{ login: 'second' },
			{ login: 'student', taken: 2, completed: 1, attendancePercent: 50 }
		]
	});
	await expect(
		getArchive(database, actor, { year: '2025', pool: 'current' })
	).rejects.toMatchObject({ status: 400 });
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null WHERE id=1`;
	expect((await getArchive(database, actor, {})).years).toEqual(['2026', '2025']);
});

it('shows finished only when no event extends beyond the end date', async () => {
	await client`UPDATE settings SET pool_end='2026-10-20' WHERE id=1`;
	expect(await getPoolPhase(database, actor, now)).toBe('closed');
	await client`UPDATE events SET event_date='2026-10-28' WHERE id=1`;
	expect(await getPoolPhase(database, actor, now)).toBe('open');
});

it('validates malformed form actions as translated 400 errors', async () => {
	for (const action of [actions.preview, actions.importCsv]) {
		const result = await action!({
			locals: { user: actor },
			request: new Request('http://localhost/admin/archive', {
				method: 'POST',
				body: new URLSearchParams({ start: 'invalid' })
			}),
			getClientAddress: () => info.ipAddress
		} as Parameters<NonNullable<typeof action>>[0]);
		expect(result).toMatchObject({
			status: 400,
			data: { ok: false, messages: [{ key: 'error_invalid_input' }] }
		});
	}
});

it('imports dense files below the byte limit without exceeding the SQL parameter limit', async () => {
	const denseCsv = writeCsv([
		[...ARCHIVE_COLUMNS],
		...Array.from({ length: 6000 }, () => row('student', { 7: 60, 8: 10 }))
	]);
	expect(Buffer.byteLength(denseCsv)).toBeLessThan(1024 * 1024);
	expect(
		await importPool(
			database,
			actor,
			{ ...input, csv: Buffer.from(denseCsv).toString('base64') },
			info,
			now
		)
	).toMatchObject({ ok: true });
	expect((await client`SELECT count(*)::int AS n FROM pool_entries`)[0].n).toBe(6000);
});
