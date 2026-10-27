import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { closePool } from '../../src/lib/server/domain/pool.ts';
import { actions, load } from '../../src/routes/admin/close-pool/+page.server.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const info = { ipAddress: '127.0.0.1', userAgent: 'pool test' };
const now = new Date('2026-10-27T10:00:00Z');
const all = { downloaded: 'yes', events: 'yes', whitelist: 'yes', weeks: 'yes', dates: 'yes' };
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
	await client`TRUNCATE pools, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15',active_week=4,display_week=3,max_events_per_user=2,updated_at='2026-01-01T00:00:00Z' WHERE id=1`;
	[actor] = await database
		.insert(schema.users)
		.values({ intraId: 42, login: 'pool_admin', role: 'admin' })
		.returning();
	await client`INSERT INTO events (title,kind,week,weekday,start_time,end_time,compensation) VALUES ('Exam','exam',1,1,'09:00','11:00',200), ('Future','custom',4,7,'14:00','15:00',100)`;
	await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (1,'present',true),(1,'absent',false),(2,'present',true)`;
	await client`INSERT INTO whitelist (login) VALUES ('present'),('absent')`;
	await client`INSERT INTO week_templates (name,target_week) VALUES ('Keep me',2)`;
	await client`INSERT INTO template_events (template_id,title,kind,weekday,start_time,end_time) VALUES (1,'Template exam','exam',1,'09:00','11:00')`;
	await client`INSERT INTO action_logs (actor_login,action_type,description) VALUES ('past_admin','LOGIN','Historical log')`;
	messages = [];
	unsubscribe = subscribe((message) => messages.push(message));
});
afterEach(() => unsubscribe());
afterAll(async () => {
	await client`TRUNCATE pools, users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_start=null,pool_end=null,active_week=1,display_week=1,max_events_per_user=0 WHERE id=1`;
	await client.end();
});

it.each([
	[] as string[],
	['events'],
	['whitelist'],
	['weeks'],
	['dates'],
	['events', 'whitelist'],
	['weeks', 'dates'],
	['events', 'whitelist', 'weeks', 'dates']
])(
	'resets only the selected parts, keeps templates and logs, and snapshots removed data (%j)',
	async (...selected) => {
		const before = await snapshot();
		const input = { downloaded: 'yes', ...Object.fromEntries(selected.map((key) => [key, 'yes'])) };
		expect(await closePool(database, actor, input, info, now)).toMatchObject({
			ok: true,
			messages: [{ key: 'pool_closed' }]
		});
		const after = await snapshot();
		expect(after.events).toEqual(selected.includes('events') ? [] : before.events);
		expect(after.registrations).toEqual(selected.includes('events') ? [] : before.registrations);
		expect(after.whitelist).toEqual(selected.includes('whitelist') ? [] : before.whitelist);
		expect(after.templates).toEqual(before.templates);
		expect(after.templateEvents).toEqual(before.templateEvents);
		expect(after.logs).toHaveLength(2);
		expect(after.logs[0]).toEqual(before.logs[0]);
		const log = after.logs[1];
		expect(log).toMatchObject({
			action_type: 'CLOSE_POOL',
			actor_login: actor.login,
			ip_address: info.ipAddress,
			user_agent: info.userAgent,
			new_value: { archiveId: Number(after.pools[0].id), entries: 3 }
		});
		const old = log.old_value;
		expect(Object.keys(old).sort()).toEqual(
			[
				...(selected.includes('events') ? ['events'] : []),
				...(selected.includes('whitelist') ? ['whitelist'] : []),
				...(selected.includes('weeks') || selected.includes('dates') ? ['settings'] : [])
			].sort()
		);
		if (selected.includes('events')) {
			expect(old.events).toHaveLength(2);
			expect(old.events[0]).toMatchObject({
				id: 1,
				title: 'Exam',
				compensation: 200,
				participants: [
					{ participantLogin: 'absent', attended: false },
					{ participantLogin: 'present', attended: true }
				]
			});
			expect(old.events[0].participants[0].registeredAt).toBe(
				new Date(before.registrations[1].registered_at).toISOString()
			);
			expect(old.events[1].participants).toHaveLength(1);
		}
		if (selected.includes('whitelist'))
			expect(old.whitelist.map((row: { login: string }) => row.login)).toEqual([
				'present',
				'absent'
			]);
		const expectedSettings = { ...before.settings[0] };
		if (selected.includes('weeks'))
			Object.assign(expectedSettings, { active_week: 1, display_week: 1 });
		if (selected.includes('dates'))
			Object.assign(expectedSettings, { pool_start: null, pool_end: null });
		if (selected.includes('weeks') || selected.includes('dates')) {
			expect(new Date(after.settings[0].updated_at)).toEqual(now);
			expectedSettings.updated_at = after.settings[0].updated_at;
			expect(old.settings).toEqual({
				...(selected.includes('weeks') ? { activeWeek: 4, displayWeek: 3 } : {}),
				...(selected.includes('dates') ? { poolStart: '2026-10-19', poolEnd: '2026-11-15' } : {})
			});
		}
		expect(after.settings[0]).toEqual(expectedSettings);
		expect(messages).toEqual([
			{ type: 'log_created', id: Number(log.id) },
			{ type: 'event_changed', eventId: null, week: null, action: 'bulk_delete' }
		]);
	}
);

it.each([
	[{}, 'pool_download_required'],
	[{ events: 'yes' }, 'pool_download_required']
])(
	'warns without any writes or publication when prerequisites are missing (%j)',
	async (input, key) => {
		const before = await snapshot();
		expect(await closePool(database, actor, input, info, now)).toEqual({
			ok: false,
			messages: [{ type: 'warning', key, params: {} }]
		});
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	}
);

it('rejects unauthorized, stale admin and malformed requests before mutation', async () => {
	const before = await snapshot();
	await expect(closePool(database, null, all, info, now)).rejects.toMatchObject({ status: 401 });
	await expect(
		closePool(database, { ...actor, role: 'user' }, all, info, now)
	).rejects.toMatchObject({ status: 403 });
	await expect(
		closePool(database, actor, { ...all, events: 'false' }, info, now)
	).rejects.toThrow();
	await expect(closePool(database, actor, { ...all, unknown: 'yes' }, info, now)).rejects.toThrow();
	await client`UPDATE users SET role='user' WHERE id=${actor.id}`;
	await expect(closePool(database, actor, all, info, now)).rejects.toMatchObject({ status: 403 });
	expect(await snapshot()).toEqual(before);
	expect(messages).toEqual([]);
});

it.each(['whitelist', 'settings', 'audit'])(
	'rolls back all changes and emits nothing if %s fails',
	async (stage) => {
		const before = await snapshot();
		if (stage === 'whitelist') {
			await client`CREATE FUNCTION test_pool_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rejection'; END $$`;
			await client`CREATE TRIGGER test_pool_delete BEFORE DELETE ON whitelist FOR EACH ROW EXECUTE FUNCTION test_pool_delete()`;
		} else if (stage === 'settings') {
			await client`ALTER TABLE settings ADD CONSTRAINT test_pool_reset CHECK (pool_start IS NOT NULL)`;
		} else {
			await client`ALTER TABLE action_logs ADD CONSTRAINT test_pool_log CHECK (action_type <> 'CLOSE_POOL')`;
		}
		try {
			await expect(closePool(database, actor, all, info, now)).rejects.toThrow();
			expect(await snapshot()).toEqual(before);
			expect(messages).toEqual([]);
		} finally {
			if (stage === 'whitelist') {
				await client`DROP TRIGGER test_pool_delete ON whitelist`;
				await client`DROP FUNCTION test_pool_delete()`;
			} else if (stage === 'settings')
				await client`ALTER TABLE settings DROP CONSTRAINT test_pool_reset`;
			else await client`ALTER TABLE action_logs DROP CONSTRAINT test_pool_log`;
		}
	}
);

it('requires pool dates even with valid download and reset choices', async () => {
	await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
	const before = await snapshot();
	expect(await closePool(database, actor, all, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'pool_dates_required' }]
	});
	expect(await snapshot()).toEqual(before);
	expect(messages).toEqual([]);
});

it('archives all registrations before cleanup with concrete dates and original metadata', async () => {
	await client`UPDATE events SET event_date='2026-12-01' WHERE id=2`;
	const before = await snapshot();
	await closePool(database, actor, all, info, now);
	const after = await snapshot();
	expect(after.pools).toHaveLength(1);
	expect(after.pools[0]).toMatchObject({
		start_date: '2026-10-19',
		end_date: '2026-11-15',
		source: 'site'
	});
	expect(new Date(after.pools[0].archived_at)).toEqual(now);
	expect(after.entries).toHaveLength(3);
	expect(after.entries[0]).toMatchObject({
		login: 'absent',
		attended: false,
		title: 'Exam',
		kind: 'exam',
		event_date: '2026-10-19',
		weekday: 1,
		start_time: '09:00:00',
		end_time: '11:00:00',
		duration_minutes: 120,
		compensation: 200
	});
	expect(new Date(after.entries[0].registered_at)).toEqual(
		new Date(before.registrations[1].registered_at)
	);
	expect(after.entries[2]).toMatchObject({
		login: 'present',
		event_date: '2026-12-01',
		duration_minutes: 60
	});
	expect(after.events).toEqual([]);
	expect(after.registrations).toEqual([]);
	expect(messages.map((message) => message.type)).toEqual(['log_created', 'event_changed']);
});

it('replaces the archive with corrected attendance, added and removed registrations', async () => {
	await closePool(database, actor, { downloaded: 'yes' }, info, now);
	const [first] = await database.select().from(schema.pools);
	await client`UPDATE registrations SET attended=true WHERE participant_login='absent'`;
	await client`DELETE FROM registrations WHERE event_id=2`;
	await client`INSERT INTO registrations (event_id,participant_login) VALUES (1,'new_login')`;
	const before = await snapshot();
	const later = new Date('2026-10-28T10:00:00Z');
	await closePool(database, actor, { downloaded: 'yes', events: 'yes' }, info, later);
	const after = await snapshot();
	expect(after.pools).toHaveLength(1);
	expect(Number(after.pools[0].id)).toBe(first.id);
	expect(new Date(after.pools[0].archived_at)).toEqual(later);
	expect(after.entries.map((row) => [row.login, row.attended])).toEqual([
		['absent', true],
		['new_login', true],
		['present', true]
	]);
	expect(after.logs.at(-1)?.new_value).toEqual({ archiveId: first.id, entries: 3 });
	expect(before.entries).toHaveLength(3);
});

it('preserves archived entries when closing again after deleting events', async () => {
	await closePool(database, actor, { downloaded: 'yes', events: 'yes' }, info, now);
	const before = await snapshot();
	expect(before.events).toEqual([]);
	expect(before.registrations).toEqual([]);
	expect(before.entries).toHaveLength(3);
	expect(before.settings[0].pool_start).toBe('2026-10-19');
	const later = new Date('2026-10-28T10:00:00Z');
	expect(
		await closePool(database, actor, { downloaded: 'yes', whitelist: 'yes' }, info, later)
	).toMatchObject({ ok: true });
	const after = await snapshot();
	expect(after.entries).toEqual(before.entries);
	expect(after.pools).toHaveLength(1);
	expect(after.pools[0].id).toBe(before.pools[0].id);
	expect(new Date(after.pools[0].archived_at)).toEqual(later);
	expect(after.whitelist).toEqual([]);
	expect(after.logs).toHaveLength(before.logs.length + 1);
	expect(after.logs.at(-1)?.new_value).toEqual({
		archiveId: Number(before.pools[0].id),
		entries: before.entries.length
	});
});

it('rolls back archive replacement as well as cleanup if writing entries fails', async () => {
	await closePool(database, actor, { downloaded: 'yes' }, info, now);
	const before = await snapshot();
	messages.length = 0;
	await client`ALTER TABLE pool_entries ADD CONSTRAINT test_pool_entry CHECK (login <> 'absent') NOT VALID`;
	try {
		await expect(closePool(database, actor, all, info, now)).rejects.toThrow();
		expect(await snapshot()).toEqual(before);
		expect(messages).toEqual([]);
	} finally {
		await client`ALTER TABLE pool_entries DROP CONSTRAINT test_pool_entry`;
	}
});

it('archives a pool without registrations and cascades deletion of its entries', async () => {
	await client`DELETE FROM registrations`;
	await closePool(database, actor, { downloaded: 'yes' }, info, now);
	expect(await database.select().from(schema.pools)).toHaveLength(1);
	expect(await database.select().from(schema.poolEntries)).toEqual([]);
	await client`INSERT INTO registrations (event_id,participant_login) VALUES (1,'new_login')`;
	await closePool(database, actor, { downloaded: 'yes' }, info, now);
	expect(await database.select().from(schema.poolEntries)).toHaveLength(1);
	await client`DELETE FROM pools`;
	expect(await database.select().from(schema.poolEntries)).toEqual([]);
});

it('previews without writes and validates the final action independently', async () => {
	const before = await snapshot();
	const preview = await load!({
		locals: { user: actor },
		url: new URL('http://localhost/admin/close-pool?review=yes&downloaded=yes&events=yes')
	} as Parameters<NonNullable<typeof load>>[0]);
	expect(preview).toMatchObject({ choices: { downloaded: 'yes', events: 'yes' }, messages: [] });
	expect(await snapshot()).toEqual(before);
	const result = await actions.closePool!({
		locals: { user: actor },
		request: new Request('http://localhost:4173/admin/close-pool?/closePool', {
			method: 'POST',
			body: new URLSearchParams({ events: 'yes' })
		}),
		getClientAddress: () => info.ipAddress
	} as Parameters<NonNullable<typeof actions.closePool>>[0]);
	expect(result).toMatchObject({ ok: false, messages: [{ key: 'pool_download_required' }] });
	expect(await snapshot()).toEqual(before);
});
