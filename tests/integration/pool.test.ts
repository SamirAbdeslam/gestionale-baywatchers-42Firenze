import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	autoClosePool,
	closePool,
	reopenPool,
	savePool,
	cleanPool
} from '../../src/lib/server/domain/pool.ts';
import { register, unregister, setAttendance } from '../../src/lib/server/domain/registrations.ts';
import { actions } from '../../src/routes/admin/+page.server.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const info = { ipAddress: '127.0.0.1', userAgent: 'pool test' };
const now = new Date('2026-10-27T10:00:00Z');
const all = {
	confirm: 'yes',
	save: 'yes',
	events: 'yes',
	whitelist: 'yes',
	weeks: 'yes',
	dates: 'yes'
};
let actor: User, messages: RealtimeEvent[], unsubscribe: () => void;
async function snapshot() {
	return {
		events: await client`SELECT * FROM events ORDER BY id`,
		registrations: await client`SELECT * FROM registrations ORDER BY id`,
		whitelist: await client`SELECT * FROM whitelist ORDER BY id`,
		settings: await client`SELECT * FROM settings`,
		templates: await client`SELECT * FROM week_templates`,
		templateEvents: await client`SELECT * FROM template_events`,
		pools: await client`SELECT * FROM pools ORDER BY id`,
		entries: await client`SELECT * FROM pool_entries ORDER BY id`,
		logs: await client`SELECT * FROM action_logs ORDER BY id`
	};
}
beforeEach(async () => {
	await client`TRUNCATE enrollment_requests, pools, week_activations, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET enrollment_code=null,pool_closed_at=null,pool_reopened=false,pool_start='2026-10-19',pool_end='2026-11-15',active_week=4,display_week=3,max_events_per_user=2,updated_at='2026-01-01T00:00:00Z' WHERE id=1`;
	[actor] = await database
		.insert(schema.users)
		.values({ intraId: 42, login: 'pool_admin', role: 'admin' })
		.returning();
	await client`INSERT INTO events (title,kind,week,weekday,start_time,end_time,compensation) VALUES ('Exam','exam',1,1,'09:00','11:00',200), ('Future','custom',4,7,'14:00','15:00',100)`;
	await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (1,'present',true),(1,'absent',false),(2,'present',true)`;
	await client`INSERT INTO whitelist (login) VALUES ('present'),('absent')`;
	await client`INSERT INTO week_activations (week,activated_at) VALUES (1,'2026-10-19T07:00:00Z')`;
	await client`INSERT INTO week_templates (name,target_week) VALUES ('Keep me',2)`;
	await client`INSERT INTO template_events (template_id,title,kind,weekday,start_time,end_time) VALUES (1,'Template exam','exam',1,'09:00','11:00')`;
	await client`INSERT INTO action_logs (actor_login,action_type,description) VALUES ('past_admin','LOGIN','Historical log')`;
	messages = [];
	unsubscribe = subscribe((message) => messages.push(message));
});
afterEach(() => unsubscribe());
afterAll(async () => {
	await client`TRUNCATE enrollment_requests, pools, week_activations, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET enrollment_code=null,pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=1,max_events_per_user=0 WHERE id=1`;
	await client.end();
});

const confirm = { confirm: 'yes' };
it('closes without cleanup, creates the first snapshot, and is idempotent', async () => {
	const before = await snapshot();
	expect(await closePool(database, actor, confirm, info, now)).toMatchObject({ ok: true });
	const after = await snapshot();
	expect(after.events).toEqual(before.events);
	expect(after.registrations).toEqual(before.registrations);
	expect(after.whitelist).toEqual(before.whitelist);
	expect(after.entries).toHaveLength(3);
	expect(after.entries[0]).toMatchObject({
		login: 'absent',
		attended: false,
		event_date: '2026-10-19',
		duration_minutes: 120,
		week: 1,
		max_slots: 10,
		event_ref: 1
	});
	expect(new Date(after.entries[0].week_activated_at)).toEqual(new Date('2026-10-19T07:00:00Z'));
	// Week 4 was never activated: the timestamp stays unknown.
	expect(after.entries[2]).toMatchObject({ week: 4, event_ref: 2, week_activated_at: null });
	expect(after.logs.at(-1)).toMatchObject({
		action_type: 'CLOSE_POOL',
		actor_login: actor.login,
		new_value: { archiveId: Number(after.pools[0].id), entries: 3 }
	});
	expect(messages.map((m) => m.type)).toEqual(['log_created', 'pool_closed']);
	await closePool(database, actor, confirm, info, now);
	expect(await snapshot()).toEqual(after);
});
it('auto closes once under concurrent requests, using SYSTEM and publishing once after commit', async () => {
	const later = new Date('2026-11-16T10:00:00Z');
	await Promise.all(Array.from({ length: 6 }, () => autoClosePool(database, later)));
	const after = await snapshot();
	expect(after.pools).toHaveLength(1);
	expect(after.entries).toHaveLength(3);
	expect(after.logs.filter((log) => log.action_type === 'CLOSE_POOL')).toHaveLength(1);
	expect(after.logs.at(-1)).toMatchObject({ actor_user_id: null, actor_login: 'SYSTEM' });
	expect(messages.map((m) => m.type)).toEqual(['log_created', 'pool_closed']);
	expect((await database.select().from(schema.settings))[0].poolClosedAt).toEqual(later);
});
it('does not auto close before the end or with an event beyond the end', async () => {
	await autoClosePool(database, now);
	expect((await snapshot()).pools).toEqual([]);
	await client`UPDATE events SET event_date='2026-11-16' WHERE id=2`;
	await autoClosePool(database, new Date('2026-11-16T10:00:00Z'));
	expect((await snapshot()).pools).toEqual([]);
	expect(messages).toEqual([]);
});
it('reopens manually, suppresses auto closure indefinitely, and can close again manually', async () => {
	const later = new Date('2026-11-16T10:00:00Z');
	await autoClosePool(database, later);
	expect(await reopenPool(database, actor, confirm, info, later)).toMatchObject({ ok: true });
	expect((await database.select().from(schema.settings))[0]).toMatchObject({
		poolClosedAt: null,
		poolReopened: true
	});
	const before = await snapshot();
	await Promise.all([
		autoClosePool(database, new Date('2027-01-01')),
		autoClosePool(database, new Date('2027-01-01'))
	]);
	expect(await snapshot()).toEqual(before);
	await closePool(database, actor, confirm, info, later);
	expect((await database.select().from(schema.settings))[0]).toMatchObject({
		poolClosedAt: later,
		poolReopened: false
	});
	expect((await snapshot()).logs.map((log) => log.action_type)).toEqual([
		'LOGIN',
		'CLOSE_POOL',
		'REOPEN_POOL',
		'CLOSE_POOL'
	]);
});
it.each(['upcoming', 'closed'])(
	'rejects student register and unregister in %s with no writes or notifications',
	async (phase) => {
		const [student] = await database
			.insert(schema.users)
			.values({ intraId: 43, login: 'present' })
			.returning();
		if (phase === 'closed') await closePool(database, actor, confirm, info, now);
		const before = await snapshot();
		messages.length = 0;
		const instant = phase === 'upcoming' ? new Date('2026-10-18T10:00:00Z') : now;
		for (const mutate of [register, unregister]) {
			expect(await mutate(database, student, { id: 1 }, info, instant)).toMatchObject({
				ok: false,
				messages: [{ key: phase === 'closed' ? 'pool_closed' : 'error_pool_not_started' }]
			});
		}
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
		if (phase === 'closed') {
			expect(
				await setAttendance(database, actor, { id: 1, login: 'absent', attended: true }, info, now)
			).toMatchObject({ ok: true });
		}
	}
);
it('saves corrections independently without reopening or closing the pool', async () => {
	await closePool(database, actor, confirm, info, now);
	await client`UPDATE registrations SET attended=true WHERE participant_login='absent'`;
	await client`DELETE FROM registrations WHERE event_id=2`;
	const config = await client`SELECT * FROM settings`;
	expect(await savePool(database, actor, {}, info, now)).toMatchObject({ ok: true });
	const after = await snapshot();
	expect(after.entries).toHaveLength(2);
	expect(after.entries.every((row) => row.attended)).toBe(true);
	expect(after.logs.at(-1)).toMatchObject({ action_type: 'SAVE_POOL', new_value: { entries: 2 } });
	expect(await client`SELECT * FROM settings`).toEqual(config);
});
it.each([
	['events'],
	['whitelist'],
	['weeks'],
	['dates'],
	['events', 'whitelist'],
	['weeks', 'dates'],
	['events', 'whitelist', 'weeks', 'dates']
])('cleans only selected parts and snapshots deleted data (%j)', async (...selected) => {
	await closePool(database, actor, confirm, info, now);
	const before = await snapshot();
	messages.length = 0;
	const input = {
		...confirm,
		save: 'yes',
		...Object.fromEntries(selected.map((key) => [key, 'yes']))
	};
	expect(await cleanPool(database, actor, input, info, now)).toMatchObject({ ok: true });
	const after = await snapshot();
	expect(after.events).toEqual(selected.includes('events') ? [] : before.events);
	expect(after.registrations).toEqual(selected.includes('events') ? [] : before.registrations);
	expect(after.whitelist).toEqual(selected.includes('whitelist') ? [] : before.whitelist);
	expect(after.templates).toEqual(before.templates);
	expect(after.templateEvents).toEqual(before.templateEvents);
	expect(after.entries).toHaveLength(3);
	expect(after.logs.slice(0, -1)).toEqual(before.logs);
	const old = after.logs.at(-1)!.old_value;
	expect(after.logs.at(-1)!.action_type).toBe('CLEAN_POOL');
	expect(Object.keys(old).sort()).toEqual(
		[
			...(selected.includes('events') ? ['events'] : []),
			...(selected.includes('whitelist') ? ['whitelist', 'enrollmentRequests'] : []),
			...(selected.includes('weeks') || selected.includes('dates') ? ['settings'] : [])
		].sort()
	);
	if (selected.includes('events'))
		expect(old.events[0]).toMatchObject({
			title: 'Exam',
			participants: [
				{ participantLogin: 'absent', attended: false },
				{ participantLogin: 'present', attended: true }
			]
		});
	if (selected.includes('whitelist'))
		expect(old.whitelist.map((row: { login: string }) => row.login)).toEqual(['present', 'absent']);
	expect(await client`SELECT * FROM week_activations`).toHaveLength(
		selected.includes('weeks') ? 0 : 1
	);
	const config = (await database.select().from(schema.settings))[0];
	expect(config).toMatchObject({
		activeWeek: selected.includes('weeks') ? 1 : 4,
		displayWeek: selected.includes('weeks') ? 1 : 3,
		poolStart: selected.includes('dates') ? null : '2026-10-19',
		poolEnd: selected.includes('dates') ? null : '2026-11-15',
		poolClosedAt: selected.includes('dates') ? null : now,
		poolReopened: false
	});
	expect(messages.map((m) => m.type)).toEqual(['log_created', 'event_changed']);
});
it('keeps the previous archive when deleting without saving again', async () => {
	await closePool(database, actor, confirm, info, now);
	const before = await snapshot();
	await client`UPDATE registrations SET attended=true WHERE participant_login='absent'`;
	expect(await cleanPool(database, actor, { ...all, save: 'no' }, info, now)).toMatchObject({
		ok: true
	});
	const after = await snapshot();
	expect(after.entries).toEqual(before.entries);
	expect(after.pools).toEqual(before.pools);
	expect(after.events).toEqual([]);
});
it('preserves the archive on repeated cleanup and explicit save with zero registrations', async () => {
	await closePool(database, actor, confirm, info, now);
	await cleanPool(database, actor, { ...confirm, save: 'yes', events: 'yes' }, info, now);
	const before = await snapshot();
	await savePool(database, actor, {}, info, new Date('2026-10-28T10:00:00Z'));
	await cleanPool(database, actor, { ...confirm, save: 'yes', whitelist: 'yes' }, info, now);
	const after = await snapshot();
	expect(after.entries).toEqual(before.entries);
	expect(after.pools).toEqual(before.pools);
	expect(after.whitelist).toEqual([]);
});
it('requires a closed pool, a cleanup choice, and a verified archive', async () => {
	const before = await snapshot();
	expect(await cleanPool(database, actor, all, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'pool_cleanup_closed' }]
	});
	expect(await snapshot()).toEqual(before);
	await closePool(database, actor, confirm, info, now);
	expect(await cleanPool(database, actor, { ...confirm, save: 'yes' }, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'pool_cleanup_empty' }]
	});
	await client`DELETE FROM pools`;
	const missing = await snapshot();
	messages.length = 0;
	expect(await cleanPool(database, actor, { ...all, save: 'no' }, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'pool_cleanup_failed' }]
	});
	expect(await snapshot()).toEqual(missing);
	expect(messages).toEqual([]);
});
it.each(['count', 'whitelist', 'settings', 'audit', 'entries'])(
	'rolls back save, deletions and logs if %s fails',
	async (stage) => {
		await closePool(database, actor, confirm, info, now);
		const before = await snapshot();
		messages.length = 0;
		if (stage === 'count') {
			await client`CREATE FUNCTION test_pool_skip() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`;
			await client`CREATE TRIGGER test_pool_skip BEFORE INSERT ON pool_entries FOR EACH ROW EXECUTE FUNCTION test_pool_skip()`;
		} else if (stage === 'whitelist') {
			await client`CREATE FUNCTION test_pool_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$`;
			await client`CREATE TRIGGER test_pool_delete BEFORE DELETE ON whitelist FOR EACH ROW EXECUTE FUNCTION test_pool_delete()`;
		} else if (stage === 'settings')
			await client`ALTER TABLE settings ADD CONSTRAINT test_pool_reset CHECK (pool_start IS NOT NULL)`;
		else if (stage === 'audit')
			await client`ALTER TABLE action_logs ADD CONSTRAINT test_pool_log CHECK (action_type <> 'CLEAN_POOL')`;
		else
			await client`ALTER TABLE pool_entries ADD CONSTRAINT test_pool_entry CHECK (login <> 'absent') NOT VALID`;
		try {
			expect(await cleanPool(database, actor, all, info, now)).toMatchObject({
				ok: false,
				messages: [{ key: 'pool_cleanup_failed' }]
			});
			expect(await snapshot()).toEqual(before);
			expect(messages).toEqual([]);
		} finally {
			if (stage === 'count') {
				await client`DROP TRIGGER test_pool_skip ON pool_entries`;
				await client`DROP FUNCTION test_pool_skip()`;
			} else if (stage === 'whitelist') {
				await client`DROP TRIGGER test_pool_delete ON whitelist`;
				await client`DROP FUNCTION test_pool_delete()`;
			} else if (stage === 'settings')
				await client`ALTER TABLE settings DROP CONSTRAINT test_pool_reset`;
			else if (stage === 'audit')
				await client`ALTER TABLE action_logs DROP CONSTRAINT test_pool_log`;
			else await client`ALTER TABLE pool_entries DROP CONSTRAINT test_pool_entry`;
		}
	}
);
it('auto closure rolls back state and archive if audit fails and does not notify', async () => {
	const before = await snapshot();
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_auto_log CHECK (action_type <> 'CLOSE_POOL')`;
	try {
		await expect(autoClosePool(database, new Date('2026-11-16T10:00:00Z'))).rejects.toThrow();
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_auto_log`;
	}
});
it('archives an empty pool and preserves date requirements', async () => {
	await client`DELETE FROM registrations`;
	await closePool(database, actor, confirm, info, now);
	expect((await snapshot()).entries).toEqual([]);
	expect((await snapshot()).pools).toHaveLength(1);
	await client`UPDATE settings SET pool_start=null,pool_end=null,pool_closed_at=null WHERE id=1`;
	for (const mutate of [closePool, savePool]) {
		expect(
			await mutate(database, actor, mutate === closePool ? confirm : {}, info, now)
		).toMatchObject({ ok: false, messages: [{ key: 'pool_dates_required' }] });
	}
});
it.each([closePool, reopenPool, savePool, cleanPool])(
	'rejects unauthorized, stale and malformed requests (%s)',
	async (mutate) => {
		const input = mutate === cleanPool ? all : mutate === savePool ? {} : confirm;
		const before = await snapshot();
		await expect(mutate(database, null, input, info, now)).rejects.toMatchObject({ status: 401 });
		await expect(
			mutate(database, { ...actor, role: 'user' }, input, info, now)
		).rejects.toMatchObject({ status: 403 });
		await expect(
			mutate(database, actor, { ...input, unknown: 'yes' }, info, now)
		).rejects.toThrow();
		await client`UPDATE users SET role='user' WHERE id=${actor.id}`;
		await expect(mutate(database, actor, input, info, now)).rejects.toMatchObject({ status: 403 });
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	}
);
it('validates confirmation in the final route action without trusting the dialog', async () => {
	const before = await snapshot();
	const result = await actions.cleanPool!({
		locals: { user: actor },
		request: new Request('http://localhost:4173/admin?/cleanPool', {
			method: 'POST',
			body: new URLSearchParams({ events: 'yes', save: 'yes' })
		}),
		getClientAddress: () => info.ipAddress
	} as Parameters<NonNullable<typeof actions.cleanPool>>[0]);
	expect(result).toMatchObject({
		status: 400,
		data: { ok: false, messages: [{ key: 'error_invalid_input' }] }
	});
	expect(await snapshot()).toEqual(before);
});

it('automatically closes and archives more than 4100 registrations', async () => {
	await client`INSERT INTO registrations (event_id,participant_login,attended)
		SELECT 1, 'bulk_' || n, n % 2 = 0 FROM generate_series(1, 4200) AS n`;
	await autoClosePool(database, new Date('2026-11-16T10:00:00Z'));
	const entries = await client`SELECT * FROM pool_entries`;
	expect(entries).toHaveLength(4203);
	expect(entries.filter((row) => row.attended)).toHaveLength(2102);
	expect(
		(await client`SELECT pool_closed_at FROM settings WHERE id=1`)[0].pool_closed_at
	).not.toBeNull();
	expect(await client`SELECT * FROM action_logs WHERE action_type='CLOSE_POOL'`).toHaveLength(1);
});
