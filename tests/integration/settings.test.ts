import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	getAdminSettings,
	setActiveWeek,
	setMaxEvents,
	setPoolDates,
	resetDisplayWeek
} from '../../src/lib/server/domain/settings.ts';
import { actions } from '../../src/routes/admin/+page.server.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

// Route actions use the same real test database as the domain assertions.
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} }),
	database = drizzle(client, { schema });
const info = { ipAddress: '127.0.0.1', userAgent: 'settings test' },
	now = new Date('2026-10-19T10:00:00Z');
let actor: User, messages: RealtimeEvent[], unsubscribe: () => void;
beforeEach(async () => {
	await client`TRUNCATE week_activations, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=3,max_events_per_user=0,updated_at='2026-01-01T00:00:00Z' WHERE id=1`;
	const [row] = await database
		.insert(schema.users)
		.values({ intraId: 42, login: 'settings_admin', role: 'admin' })
		.returning();
	actor = row;
	messages = [];
	unsubscribe = subscribe((message) => messages.push(message));
});
afterEach(() => unsubscribe());
afterAll(async () => {
	await client`TRUNCATE week_activations, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=1,max_events_per_user=0 WHERE id=1`;
	await client.end();
});
it('reads the active week by default and computes all seven dates without Monday alignment', async () => {
	expect((await getAdminSettings(database, actor, {})).dayDates).toEqual(Array(7).fill(null));
	await setPoolDates(database, actor, { start: '2026-12-30', end: '2027-01-26' }, info, now);
	const result = await getAdminSettings(database, actor, { week: '4' });
	expect(result.week).toBe(4);
	expect(result.settings.poolEnd).toBe('2027-01-26');
	expect(result.dayDates).toEqual([
		'2027-01-20',
		'2027-01-21',
		'2027-01-22',
		'2027-01-23',
		'2027-01-24',
		'2027-01-25',
		'2027-01-26'
	]);
	await expect(getAdminSettings(database, actor, { week: '5' })).rejects.toThrow();
	await expect(getAdminSettings(database, { ...actor, role: 'user' }, {})).rejects.toMatchObject({
		status: 403
	});
});
it('updates only the requested fields, audits every action once and publishes after commit', async () => {
	await setPoolDates(database, actor, { start: '2026-10-20', end: '2026-11-30' }, info, now);
	await setActiveWeek(database, actor, { week: '4' }, info, now);
	await setMaxEvents(database, actor, { maxEvents: '2' }, info, now);
	await resetDisplayWeek(database, actor, info, now);
	const { settings, week } = await getAdminSettings(database, actor, {});
	expect(week).toBe(4);
	expect(settings).toMatchObject({
		poolStart: '2026-10-20',
		poolEnd: '2026-11-30',
		activeWeek: 4,
		displayWeek: 1,
		maxEventsPerUser: 2,
		updatedAt: now
	});
	const logs =
		await client`SELECT id::int,action_type,description,old_value,new_value FROM action_logs ORDER BY id`;
	expect(logs).toHaveLength(4);
	expect(logs.map((row) => row.action_type)).toEqual([
		'UPDATE_SETTING',
		'ACTIVATE_WEEK',
		'UPDATE_SETTING',
		'UPDATE_SETTING'
	]);
	expect(logs.map((log) => [log.old_value, log.new_value])).toEqual([
		[
			{ poolStart: null, poolEnd: null, poolClosedAt: null, poolReopened: false },
			{ poolStart: '2026-10-20', poolEnd: '2026-11-30', poolClosedAt: null, poolReopened: false }
		],
		[{ activeWeek: 1 }, { activeWeek: 4 }],
		[{ maxEventsPerUser: 0 }, { maxEventsPerUser: 2 }],
		[{ displayWeek: 3 }, { displayWeek: 1 }]
	]);
	expect(logs[1].description).toBe('Settimana 4 attivata');
	expect(logs[0].description).toBe('Date pool impostate. Inizio: 2026-10-20, Fine: 2026-11-30');
	expect(messages).toEqual([
		{ type: 'log_created', id: 1 },
		{ type: 'event_changed', eventId: null, week: null, action: 'update' },
		{ type: 'log_created', id: 2 },
		{ type: 'week_activated', week: 4 },
		{ type: 'log_created', id: 3 },
		{ type: 'log_created', id: 4 }
	]);
});
it.each([
	[setActiveWeek, { week: 0 }],
	[setActiveWeek, { week: 5 }],
	[setActiveWeek, { week: 1.5 }],
	[setActiveWeek, { week: 'invalid' }],
	[setMaxEvents, { maxEvents: -1 }],
	[setMaxEvents, { maxEvents: 1.5 }],
	[setMaxEvents, { maxEvents: 32768 }],
	[setMaxEvents, { maxEvents: '' }],
	[setPoolDates, { start: '2026-02-30' }],
	[setPoolDates, { start: '2026-10-20', end: '2026-10-19' }]
])('rejects invalid settings without writes, logs or messages (%s)', async (mutate, input) => {
	const before = await client`SELECT * FROM settings`;
	await expect(mutate(database, actor, input, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM settings`).toEqual(before);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it.each([setActiveWeek, setMaxEvents, setPoolDates])(
	'checks admin privileges inside the domain before validation (%s)',
	async (mutate) => {
		await expect(mutate(database, null, {}, info, now)).rejects.toMatchObject({ status: 401 });
		await expect(mutate(database, { ...actor, role: 'user' }, {}, info, now)).rejects.toMatchObject(
			{ status: 403 }
		);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);
it('retains independent concurrent changes and supports the maximum stored limit', async () => {
	await Promise.all([
		setActiveWeek(database, actor, { week: 2 }, info, now),
		setMaxEvents(database, actor, { maxEvents: 32767 }, info, now),
		setPoolDates(database, actor, { start: '2024-02-28', end: '2024-03-26' }, info, now),
		resetDisplayWeek(database, actor, info, now)
	]);
	expect((await getAdminSettings(database, actor, {})).settings).toMatchObject({
		activeWeek: 2,
		maxEventsPerUser: 32767,
		poolStart: '2024-02-28',
		poolEnd: '2024-03-26',
		displayWeek: 1
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(4);
});
it.each([
	[setMaxEvents, { maxEvents: 3 }],
	[setPoolDates, { start: '2026-10-19', end: '2026-11-15' }]
])('rolls back settings and emits no event if audit fails (%s)', async (mutate, input) => {
	const before = await client`SELECT * FROM settings`;
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_setting CHECK (action_type <> 'UPDATE_SETTING')`;
	try {
		await expect(mutate(database, actor, input, info, now)).rejects.toThrow();
		expect(await client`SELECT * FROM settings`).toEqual(before);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_reject_setting`;
	}
});

it('guards reset without consuming input', async () => {
	await expect(resetDisplayWeek(database, null, info, now)).rejects.toMatchObject({ status: 401 });
	await expect(
		resetDisplayWeek(database, { ...actor, role: 'user' }, info, now)
	).rejects.toMatchObject({ status: 403 });
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it.each(['1999-12-31', '2101-01-01', '9999-12-31'])(
	'returns 400 for a pool date outside 2000-2100 (%s), without writes',
	async (value) => {
		const before = await client`SELECT * FROM settings`;
		for (const form of [
			{ start: value, end: '' },
			{ start: '2026-10-19', end: value }
		]) {
			const result = await actions.setPoolDates!({
				locals: { user: actor },
				request: new Request('http://localhost:4173/admin?/setPoolDates', {
					method: 'POST',
					body: new URLSearchParams(form)
				}),
				getClientAddress: () => info.ipAddress
			} as Parameters<NonNullable<typeof actions.setPoolDates>>[0]);
			expect(result).toMatchObject({
				status: 400,
				data: { ok: false, messages: [{ key: 'error_invalid_input' }] }
			});
		}
		expect(await client`SELECT * FROM settings`).toEqual(before);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);
it('accepts boundary years and rejects an explicit end outside the range', async () => {
	await setPoolDates(database, actor, { start: '2000-01-01', end: '2100-12-31' }, info, now);
	expect((await getAdminSettings(database, actor, {})).settings.poolEnd).toBe('2100-12-31');
	const before = await client`SELECT * FROM settings`;
	await expect(
		setPoolDates(database, actor, { start: '2100-12-05', end: '2101-01-01' }, info, now)
	).rejects.toThrow();
	expect(await client`SELECT * FROM settings`).toEqual(before);
});
it.each([{ start: '2026-10-19' }, { start: '2026-10-19', end: '' }, { end: '2026-11-15' }])(
	'requires both pool dates (%j)',
	async (input) => {
		const before = await client`SELECT * FROM settings`;
		await expect(setPoolDates(database, actor, input, info, now)).rejects.toThrow();
		expect(await client`SELECT * FROM settings`).toEqual(before);
		expect(messages).toEqual([]);
	}
);
it.each([true, false])(
	'preserves closed/reopened state when only the end changes (%s)',
	async (closed) => {
		await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15',pool_closed_at=${closed ? now.toISOString() : null},pool_reopened=${!closed} WHERE id=1`;
		await setPoolDates(database, actor, { start: '2026-10-19', end: '2026-12-01' }, info, now);
		const [row] = await database.select().from(schema.settings);
		expect(row).toMatchObject({
			poolEnd: '2026-12-01',
			poolClosedAt: closed ? now : null,
			poolReopened: !closed
		});
	}
);
it('rejects a changed start while closed without writes, audit or publication', async () => {
	await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15',pool_closed_at=${now.toISOString()} WHERE id=1`;
	const before = await client`SELECT * FROM settings`;
	expect(
		await setPoolDates(database, actor, { start: '2026-10-20', end: '2026-12-01' }, info, now)
	).toMatchObject({ ok: false, messages: [{ key: 'pool_dates_locked' }] });
	expect(await client`SELECT * FROM settings`).toEqual(before);
	expect(await client`SELECT * FROM action_logs`).toEqual([]);
	expect(messages).toEqual([]);
});
it('starts from none with clean lifecycle fields even after incomplete legacy dates', async () => {
	await client`UPDATE settings SET pool_closed_at=${now.toISOString()},pool_reopened=true WHERE id=1`;
	await setPoolDates(database, actor, { start: '2026-10-19', end: '2026-11-15' }, info, now);
	expect((await database.select().from(schema.settings))[0]).toMatchObject({
		poolClosedAt: null,
		poolReopened: false
	});
});
it('allows changing the start while open or upcoming and preserves the reopen override', async () => {
	await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15',pool_reopened=true WHERE id=1`;
	expect(
		await setPoolDates(database, actor, { start: '2026-10-20', end: '2026-12-01' }, info, now)
	).toMatchObject({ ok: true });
	expect((await database.select().from(schema.settings))[0]).toMatchObject({
		poolStart: '2026-10-20',
		poolReopened: true
	});
});
it('records the actual previous value for concurrent changes to the same setting', async () => {
	await Promise.all([2, 3].map((week) => setActiveWeek(database, actor, { week }, info, now)));
	const logs = await client`SELECT old_value,new_value FROM action_logs ORDER BY id`;
	expect(logs).toHaveLength(2);
	expect(logs[0].old_value).toEqual({ activeWeek: 1 });
	expect(logs[1].old_value).toEqual(logs[0].new_value);
});

it.each(['0x2', '1e0', ' 2 ', '2.0', '000002'])(
	'rejects non-decimal setting inputs and week queries (%s)',
	async (value) => {
		const before = await client`SELECT * FROM settings`;
		await expect(setActiveWeek(database, actor, { week: value }, info, now)).rejects.toThrow();
		await expect(setMaxEvents(database, actor, { maxEvents: value }, info, now)).rejects.toThrow();
		await expect(getAdminSettings(database, actor, { week: value })).rejects.toThrow();
		expect(await client`SELECT * FROM settings`).toEqual(before);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);

it('upserts the activation time of the activated week', async () => {
	await setActiveWeek(database, actor, { week: 2 }, info, now);
	const later = new Date('2026-10-20T10:00:00Z');
	await setActiveWeek(database, actor, { week: 2 }, info, later);
	await setActiveWeek(database, actor, { week: 3 }, info, now);
	const rows = await client`SELECT week, activated_at FROM week_activations ORDER BY week`;
	expect(rows.map((row) => [row.week, new Date(row.activated_at)])).toEqual([
		[2, later],
		[3, now]
	]);
});
