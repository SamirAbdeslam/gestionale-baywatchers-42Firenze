import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { makeFakeDb } from '../../scripts/legacy/make-fake-db.ts';
import { importLegacy } from '../../scripts/import-legacy.ts';
import { verifyImport } from '../../scripts/verify-legacy-import.ts';
import { seedDatabase } from '../../scripts/seed.ts';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { connect_timeout: 5, onnotice: () => {} });
const directory = mkdtempSync(join(tmpdir(), 'baywatchers-integration-'));
let path: string;
beforeEach(async () => {
	await client`TRUNCATE users, events, registrations, week_templates, template_events, whitelist, action_logs CASCADE`;
	path = join(directory, `${crypto.randomUUID()}.db`);
	makeFakeDb(path);
});
afterAll(async () => {
	await client`TRUNCATE users, events, registrations, week_templates, template_events, whitelist, action_logs CASCADE`;
	await client.end();
	rmSync(directory, { recursive: true, force: true });
});
function edit(sql: string) {
	const db = new Database(path);
	db.pragma('foreign_keys = OFF');
	try {
		db.exec(sql);
	} finally {
		db.close();
	}
}
it('imports and independently verifies the complete fixture and aligned sequences', async () => {
	edit("UPDATE template_events SET event_date='invalid' WHERE id=1");
	const report = await importLegacy(client, path);
	expect((await client`SELECT count(*)::int AS n FROM template_events`)[0].n).toBe(21);
	expect(report.tables.users).toEqual({ read: 60, imported: 60, skipped: 0 });
	expect(report.tables.registrations).toEqual({ read: 362, imported: 360, skipped: 2 });
	expect(report.tables.push_subscriptions).toEqual({ read: 1, imported: 0, skipped: 1 });
	expect(await verifyImport(client, path)).toMatchObject({ events: 60, status: 'ok' });
	const [log] =
		await client`SELECT actor_user_id, old_value, new_value FROM action_logs WHERE id=3`;
	expect(log).toEqual({
		actor_user_id: 3,
		old_value: { legacy: "(5, 'Icebreaker')" },
		new_value: { legacy: "{'title': 'x'}" }
	});
	const [settings] =
		await client`SELECT active_week, display_week, max_events_per_user, pool_start::text AS pool_start FROM settings`;
	expect(settings).toEqual({
		active_week: 2,
		display_week: 2,
		max_events_per_user: 3,
		pool_start: '2026-10-12'
	});
	const [user] =
		await client`INSERT INTO users(intra_id,login) VALUES (99999,'next_user') RETURNING id`;
	expect(user.id).toBe(61);
	const [event] =
		await client`INSERT INTO events(week,title,weekday,start_time,end_time) VALUES (1,'Next',1,'09:00','10:00') RETURNING id`;
	expect(event.id).toBe(61);
});
it('dry run leaves data, settings and sequences untouched', async () => {
	const before = await client`SELECT * FROM settings`;
	const sequences =
		await client`SELECT schemaname, sequencename, last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`;
	expect((await importLegacy(client, path, { dryRun: true })).tables.users.imported).toBe(60);
	expect((await client`SELECT count(*)::int AS n FROM users`)[0].n).toBe(0);
	expect(await client`SELECT * FROM settings`).toEqual(before);
	expect(
		await client`SELECT schemaname, sequencename, last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`
	).toEqual(sequences);
});
it('refuses nonempty databases and requires exact confirmation even with force', async () => {
	await client`INSERT INTO users(intra_id,login) VALUES (99999,'existing')`;
	await expect(importLegacy(client, path)).rejects.toThrow('not empty');
	await expect(importLegacy(client, path, { forceEmpty: true })).rejects.toThrow('confirmation');
	await expect(
		importLegacy(client, path, { forceEmpty: true, confirm: async () => 'YES' })
	).rejects.toThrow('confirmation');
	await importLegacy(client, path, { forceEmpty: true, dryRun: true, confirm: async () => 'yes' });
	expect((await client`SELECT login FROM users`)[0].login).toBe('existing');
	await importLegacy(client, path, { forceEmpty: true, confirm: async () => 'yes' });
	expect((await client`SELECT count(*)::int AS n FROM users`)[0].n).toBe(60);
});
it('normalizes legacy anomalies, keeps the oldest duplicate and maps unknown actors to null', async () => {
	edit(`UPDATE events SET day='unknown' WHERE id=1;
 UPDATE events SET end_time=start_time WHERE id=2;
 UPDATE events SET day='LUNEDI', max_slots=0, title='èVento API' WHERE id=3;
 UPDATE registrations SET registration_date='2026-09-01 09:00:00.000000', attended=0 WHERE id=361;
 UPDATE action_logs SET user_id=999999, user_agent='${'x'.repeat(250)}' WHERE id=1;
 INSERT INTO baywatcher_whitelist(intra_login,added_at) SELECT upper(intra_login),added_at FROM baywatcher_whitelist WHERE id=1;`);
	const report = await importLegacy(client, path);
	expect(report.tables.events.skipped).toBe(2);
	expect(report.tables.registrations.skipped).toBe(14);
	expect(report.tables.baywatcher_whitelist.skipped).toBe(1);
	expect((await client`SELECT title,max_slots,weekday FROM events WHERE id=3`)[0]).toEqual({
		title: 'ÈVento API',
		max_slots: 1,
		weekday: 1
	});
	expect(
		(
			await client`SELECT actor_user_id,length(user_agent)::int AS length FROM action_logs WHERE id=1`
		)[0]
	).toEqual({ actor_user_id: null, length: 200 });
	expect(await verifyImport(client, path)).toMatchObject({ events: 58, status: 'ok' });
});
it('retains the oldest normalized login duplicate regardless of input id', async () => {
	edit(
		"UPDATE registrations SET registration_date='2026-09-01 09:00:00.000000', attended=0 WHERE id=361"
	);
	await importLegacy(client, path);
	expect(
		(
			await client`SELECT id,attended FROM registrations WHERE event_id=1 AND participant_login='external0'`
		)[0]
	).toEqual({ id: 361, attended: false });
	expect(await verifyImport(client, path)).toMatchObject({ status: 'ok' });
});
it('rolls back all writes on a foreign-key failure', async () => {
	edit('UPDATE template_events SET template_id=99999 WHERE id=1');
	await expect(importLegacy(client, path)).rejects.toThrow();
	expect((await client`SELECT count(*)::int AS n FROM users`)[0].n).toBe(0);
	expect((await client`SELECT count(*)::int AS n FROM events`)[0].n).toBe(0);
});
it('detects registration and compensation corruption', async () => {
	await importLegacy(client, path);
	await client`UPDATE events SET compensation=compensation+1 WHERE id=1`;
	await expect(verifyImport(client, path)).rejects.toThrow('participant hours and Altarian');
	await client`DELETE FROM registrations WHERE id=2`;
	await expect(verifyImport(client, path)).rejects.toThrow('registrations');
});
it('enforces checks, uniqueness and cascades while retaining audit history', async () => {
	await importLegacy(client, path);
	await expect(client`INSERT INTO settings(id) VALUES (2)`).rejects.toThrow();
	await expect(client`UPDATE users SET login='UPPER' WHERE id=1`).rejects.toThrow();
	await expect(client`UPDATE events SET week=5 WHERE id=1`).rejects.toThrow();
	await expect(client`UPDATE events SET weekday=8 WHERE id=1`).rejects.toThrow();
	await expect(client`UPDATE events SET end_time=start_time WHERE id=1`).rejects.toThrow();
	await expect(client`UPDATE events SET max_slots=0 WHERE id=1`).rejects.toThrow();
	await expect(
		client`INSERT INTO registrations(event_id,participant_login) SELECT event_id,participant_login FROM registrations LIMIT 1`
	).rejects.toThrow();
	await client`INSERT INTO sessions(id,user_id,expires_at) VALUES ('test',1,now())`;
	await client`DELETE FROM users WHERE id=1`;
	expect(await client`SELECT * FROM sessions`).toHaveLength(0);
	expect(
		(await client`SELECT actor_user_id FROM action_logs WHERE id=1`)[0].actor_user_id
	).toBeNull();
	await client`DELETE FROM events WHERE id=1`;
	expect(await client`SELECT * FROM registrations WHERE event_id=1`).toHaveLength(0);
	await client`DELETE FROM week_templates WHERE id=1`;
	expect(await client`SELECT * FROM template_events WHERE template_id=1`).toHaveLength(0);
});
it('seeds Postgres directly with dev users and dates around today', async () => {
	expect(await seedDatabase(client, 42, new Date('2026-10-16T10:00:00Z'))).toEqual({
		users: 60,
		events: 60
	});
	expect((await client`SELECT role FROM users WHERE login='dev_admin'`)[0].role).toBe('admin');
	expect((await client`SELECT pool_start::text AS start FROM settings`)[0].start).toBe(
		'2026-10-12'
	);
	expect(await client`SELECT login FROM whitelist WHERE login='dev_outsider'`).toHaveLength(0);
	expect(
		(
			await client`SELECT count(*)::int AS n FROM whitelist WHERE login IN ('dev_admin','dev_user')`
		)[0].n
	).toBe(2);
});

it('uses setting defaults and preserves scalar JSON and timestamp precision', async () => {
	edit(`DELETE FROM settings;
 UPDATE action_logs SET old_value='"a string"', new_value='42' WHERE id=1;
 UPDATE template_events SET day='invalid' WHERE id=1;
 UPDATE template_events SET max_slots=0, day='DOMENICA' WHERE id=2;`);
	const report = await importLegacy(client, path);
	expect(report.tables.template_events.skipped).toBe(1);
	expect(
		(await client`SELECT active_week,display_week,max_events_per_user,pool_start FROM settings`)[0]
	).toEqual({ active_week: 1, display_week: 1, max_events_per_user: 0, pool_start: null });
	expect(
		(
			await client`SELECT old_value,new_value,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US') AS stamp FROM action_logs WHERE id=1`
		)[0]
	).toEqual({ old_value: 'a string', new_value: 42, stamp: '2026-10-01 08:20:30.123456' });
	expect((await client`SELECT weekday,max_slots FROM template_events WHERE id=2`)[0]).toEqual({
		weekday: 7,
		max_slots: 1
	});
});
