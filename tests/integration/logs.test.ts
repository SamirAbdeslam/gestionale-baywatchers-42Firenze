import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { exportLogs, getLogs } from '../../src/lib/server/domain/logs.ts';
import { load } from '../../src/routes/admin/logs/+page.server.ts';
import { GET } from '../../src/routes/admin/logs.csv/+server.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
let admin: User, user: User;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	[admin, user] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'staff', role: 'admin' },
			{ intraId: 2, login: 'student', role: 'user' }
		])
		.returning();
});
afterAll(async () => {
	await truncate();
	await client.end();
});
async function entry(
	date: string,
	actorLogin = 'alpha',
	actionType = 'CREATE_EVENT',
	description = 'Descrizione'
) {
	return (
		await database
			.insert(schema.actionLogs)
			.values({
				createdAt: new Date(date),
				actorLogin,
				actionType,
				description,
				ipAddress: '127.0.0.1',
				userAgent: '<img src=x onerror=alert(1)>',
				oldValue: { title: 'Prima' },
				newValue: { title: 'Dopo' }
			})
			.returning()
	)[0];
}
it('paginates 50 rows, sorts timestamp/id descending and provides global distinct options', async () => {
	await database.insert(schema.actionLogs).values(
		Array.from({ length: 101 }, (_, i) => ({
			createdAt: new Date('2026-10-22T10:00:00Z'),
			actorLogin: i % 2 ? 'alpha' : 'beta',
			actionType: i % 2 ? 'LOGIN' : 'CREATE_EVENT',
			description: String(i)
		}))
	);
	const first = await getLogs(database, admin, {});
	expect(first).toMatchObject({
		total: 101,
		totalPages: 3,
		page: 1,
		users: ['alpha', 'beta'],
		actions: ['CREATE_EVENT', 'LOGIN']
	});
	expect(first.rows).toHaveLength(50);
	expect(first.rows[0].description).toBe('100');
	const second = await getLogs(database, admin, { page: '2' });
	expect(second.rows).toHaveLength(50);
	expect(second.rows[0].description).toBe('50');
	const last = await getLogs(database, admin, { page: '999' });
	expect(last.page).toBe(3);
	expect(last.rows.map((row) => row.description)).toEqual(['0']);
	expect(await client`SELECT count(*)::int AS n FROM action_logs`).toEqual([{ n: 101 }]);
});
it('combines exact user/action filters without narrowing distinct options or writing audit', async () => {
	await entry('2026-10-22T00:00:00Z');
	await entry('2026-10-22T01:00:00Z', 'alpha', 'LOGIN');
	await entry('2026-10-22T02:00:00Z', 'Alpha');
	await entry('2026-10-22T03:00:00Z', 'alphabet');
	const result = await getLogs(database, admin, {
		date: '2026-10-22',
		user: 'alpha',
		action: 'CREATE_EVENT'
	});
	expect(result.rows).toHaveLength(1);
	expect(result.users).toEqual(['Alpha', 'alpha', 'alphabet']);
	expect(result.actions).toEqual(['CREATE_EVENT', 'LOGIN']);
	expect((await getLogs(database, admin, { user: "alpha' OR 1=1 --" })).total).toBe(0);
	expect((await getLogs(database, admin, { action: 'create_event' })).total).toBe(0);
	expect((await client`SELECT count(*)::int AS n FROM action_logs`)[0].n).toBe(4);
});
for (const [date, start, end] of [
	['2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
	['2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z']
])
	it(`uses Europe/Rome midnight bounds across daylight saving on ${date}`, async () => {
		for (const value of [
			new Date(start).getTime() - 1,
			new Date(start).getTime(),
			new Date(end).getTime() - 1,
			new Date(end).getTime()
		])
			await entry(new Date(value).toISOString());
		const result = await getLogs(database, admin, { date });
		expect(result.rows.map((row) => row.createdAt.toISOString())).toEqual([
			new Date(new Date(end).getTime() - 1).toISOString(),
			new Date(start).toISOString()
		]);
	});
it('returns an empty first page and header-only CSV for no matching logs', async () => {
	const result = await getLogs(database, admin, {});
	expect(result).toMatchObject({
		rows: [],
		total: 0,
		page: 1,
		totalPages: 1,
		users: [],
		actions: []
	});
	expect(await exportLogs(database, admin, {})).toBe(
		'ID,Data e ora,ID utente,Utente,Tipo azione,Descrizione,IP,User agent,ID risorsa,Tipo risorsa,Valore precedente,Nuovo valore\r\n'
	);
});
it.each([
	{ date: '2026-02-30' },
	{ date: '0000-01-01' },
	{ page: '0' },
	{ page: '-1' },
	{ page: '1e0' },
	{ page: ' 2 ' },
	{ page: '2147483648' },
	{ user: 'a'.repeat(201) },
	{ action: 'a'.repeat(101) }
])('rejects malformed filters %j with 400 and no writes', async (input) => {
	await expect(getLogs(database, admin, input)).rejects.toMatchObject({ status: 400 });
	await expect(exportLogs(database, admin, input)).rejects.toMatchObject({ status: 400 });
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('protects both page data and CSV from anonymous and non-admin callers', async () => {
	for (const [actor, status] of [
		[null, 401],
		[user, 403]
	] as const) {
		await expect(getLogs(database, actor, {})).rejects.toMatchObject({ status });
		await expect(exportLogs(database, actor, {})).rejects.toMatchObject({ status });
	}
});
it('exports all matching rows despite page size, with all fields, JSON, quoting, formula protection and CRLF', async () => {
	await database.insert(schema.actionLogs).values(
		Array.from({ length: 51 }, () => ({
			createdAt: new Date('2026-10-22T10:00:00Z'),
			actorLogin: 'alpha',
			actionType: 'LOGIN',
			description: '=1+1'
		}))
	);
	await entry('2026-10-22T11:00:00Z', 'beta');
	const csv = await exportLogs(database, admin, { user: 'alpha', page: '2' });
	expect(csv.split('\r\n')).toHaveLength(53);
	expect(csv).toContain("2026-10-22 12:00:00,,alpha,LOGIN,'=1+1");
	expect(csv).not.toContain('beta');
	await client`DELETE FROM action_logs`;
	const row = await entry(
		'2026-10-22T10:00:00Z',
		'alpha',
		'UPDATE_EVENT',
		'Virgola, "test"\na capo'
	);
	const exact = await exportLogs(database, admin, {});
	expect(exact).toContain(
		`${row.id},2026-10-22 12:00:00,,alpha,UPDATE_EVENT,"Virgola, ""test""\na capo",127.0.0.1,<img src=x onerror=alert(1)>,,,"{""title"":""Prima""}","{""title"":""Dopo""}"\r\n`
	);
});
it('loads formatted rows and serves the CSV endpoint with the same filters and filename', async () => {
	const row = await entry('2026-10-22T10:00:00Z');
	const event = {
		locals: { user: admin },
		url: new URL('http://localhost/admin/logs?user=alpha'),
		depends: vi.fn()
	};
	const result = await load(event as unknown as Parameters<typeof load>[0]);
	assert(result);
	expect(result.rows[0]).toMatchObject({
		id: row.id,
		category: 'create',
		timestamp: expect.stringContaining('12:00:00')
	});
	expect(event.depends).toHaveBeenCalledWith('app:logs');
	const response = await GET(event as unknown as Parameters<typeof GET>[0]);
	expect(response.headers.get('content-disposition')).toBe(
		'attachment; filename="action_logs.csv"'
	);
	expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
	expect(await response.text()).toBe(await exportLogs(database, admin, { user: 'alpha' }));
});
