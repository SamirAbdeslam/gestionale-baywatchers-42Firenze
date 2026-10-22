import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { getParticipants } from '../../src/lib/server/domain/reports.ts';
import { GET as summary } from '../../src/routes/admin/participants/summary.csv/+server.ts';
import { GET as detailed } from '../../src/routes/admin/participants/detailed.csv/+server.ts';
import { GET as personal } from '../../src/routes/admin/participants/[login].csv/+server.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
let admin: User, user: User;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	await client`UPDATE settings SET pool_start='2026-10-26',pool_end='2026-11-22' WHERE id=1`;
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
	await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
	await client.end();
});
async function fixture() {
	const entries = await database
		.insert(schema.events)
		.values([
			{
				title: 'Later week',
				week: 4,
				weekday: 7,
				startTime: '14:00',
				endTime: '15:00',
				compensation: 400
			},
			{
				title: 'Later time',
				week: 1,
				weekday: 1,
				startTime: '11:00',
				endTime: '11:20',
				compensation: 100
			},
			{
				title: 'Earlier time',
				week: 1,
				weekday: 1,
				eventDate: '2027-01-04',
				startTime: '09:00',
				endTime: '10:30',
				compensation: 200
			},
			{
				title: 'Absent only',
				week: 2,
				weekday: 6,
				startTime: '10:00',
				endTime: '12:00',
				compensation: 999
			}
		])
		.returning();
	await database.insert(schema.registrations).values(
		entries.map((event, i) => ({
			eventId: event.id,
			participantLogin: i === 3 ? 'zeta' : 'alpha',
			attended: i !== 0 && i !== 3,
			registeredAt: new Date('2026-10-22T07:00:00Z')
		}))
	);
}
it('includes logins without user accounts and only-absent participants, groups and sorts all events', async () => {
	await fixture();
	const result = await getParticipants(database, admin);
	expect(result.map((p) => p.login)).toEqual(['alpha', 'zeta']);
	expect(result[0]).toMatchObject({ events: 2, hours: 1.83, altarian: 300 });
	expect(result[0].weeks.map((w) => w.week)).toEqual([1, 4]);
	expect(result[0].weeks[0].events.map((event) => event.title)).toEqual([
		'Earlier time',
		'Later time'
	]);
	expect(result[0].weeks[0].events[0].date).toBe('2027-01-04');
	expect(result[0].weeks[0].events[1].date).toBe('2026-10-26');
	expect(result[0].weeks[1].events[0]).toMatchObject({
		date: '2026-11-22',
		weekday: 7,
		attended: false
	});
	expect(result[1]).toMatchObject({ events: 0, hours: 0, altarian: 0 });
	expect(result[1].weeks[0].events[0].weekday).toBe(6);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('returns null for missing pool dates and filters a single validated login', async () => {
	await fixture();
	await client`UPDATE settings SET pool_start=null WHERE id=1`;
	const result = await getParticipants(database, admin, 'alpha');
	expect(result).toHaveLength(1);
	expect(result[0].weeks[0].events[0].date).toBe('2027-01-04');
	expect(result[0].weeks[0].events[1].date).toBe(null);
	expect(await getParticipants(database, admin, 'unknown')).toEqual([]);
});
it.each([null, 'user'] as const)(
	'requires admin access before validating the login: %s',
	async (role) => {
		await expect(getParticipants(database, role ? user : null, 'bad login')).rejects.toMatchObject({
			status: role ? 403 : 401
		});
	}
);
it.each(['ALPHA', 'bad login', '../alpha', 'a'.repeat(33), 'alpha\r\nx'])(
	'rejects unsafe login %s',
	async (login) => {
		await expect(getParticipants(database, admin, login)).rejects.toThrow();
	}
);
it('serves all three CSV endpoints with exact headers, filenames, CRLF and validated params', async () => {
	await fixture();
	const event = { locals: { user: admin }, params: { login: 'alpha' } };
	const first = await summary(event as unknown as Parameters<typeof summary>[0]);
	expect(first.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
	expect(first.headers.get('Content-Disposition')).toBe(
		'attachment; filename="partecipanti_sintetico.csv"'
	);
	expect(await first.text()).toBe(
		'Nome Partecipante,Eventi Iscritti,Ore Totali,Altarian Totale\r\nalpha,2,1.83,300\r\nzeta,0,0,0\r\n'
	);
	const second = await detailed(event as unknown as Parameters<typeof detailed>[0]);
	expect(second.headers.get('Content-Disposition')).toBe(
		'attachment; filename="partecipanti_dettagliato.csv"'
	);
	expect(await second.text()).toContain('Later week (Domenica 22/11/2026, 1h, NON PARTECIPATO)');
	const third = await personal(event as unknown as Parameters<typeof personal>[0]);
	expect(third.headers.get('Content-Disposition')).toBe(
		'attachment; filename="partecipante_alpha.csv"'
	);
	expect(await third.text()).toContain(
		'Later week,Domenica,14:00,15:00,1,0,NON PARTECIPATO,2026-10-22 09:00:00\r\n'
	);
	await expect(
		personal({ ...event, params: { login: 'bad login' } } as Parameters<typeof personal>[0])
	).rejects.toMatchObject({ status: 400 });
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
