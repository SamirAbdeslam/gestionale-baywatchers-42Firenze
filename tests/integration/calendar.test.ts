import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { getCalendar } from '../../src/lib/server/domain/calendar.ts';
import { downloadIcs } from '../../src/lib/server/domain/ics.ts';
import { GET } from '../../src/routes/events/[id]/calendar.ics/+server.ts';
import { actions } from '../../src/routes/calendar/+page.server.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-21T10:00:00Z');
let user: User, admin: User;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	vi.stubEnv('TZ', 'Europe/Rome');
	await truncate();
	await client`UPDATE settings SET pool_start=null,pool_end=null,active_week=3,display_week=1,max_events_per_user=0 WHERE id=1`;
	[user, admin] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'student', role: 'user' },
			{ intraId: 2, login: 'staff', role: 'admin' }
		])
		.returning();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
	await truncate();
	await client`UPDATE settings SET active_week=1,pool_start=null,pool_end=null WHERE id=1`;
	await client.end();
});
async function event(values: Partial<typeof schema.events.$inferInsert> = {}) {
	const [row] = await database
		.insert(schema.events)
		.values({
			title: 'Fixture',
			week: 3,
			weekday: 1,
			startTime: '09:00',
			endTime: '10:00',
			maxSlots: 2,
			...values
		})
		.returning();
	return row;
}
it('defaults to the active week, clamps bounds and never includes future events', async () => {
	await event();
	await event({ week: 4, title: 'Future hidden' });
	await event({ week: 1, title: 'First' });
	expect((await getCalendar(database, user, {}, now)).week).toBe(3);
	for (const week of ['4', '99999']) {
		const data = await getCalendar(database, admin, { week }, now);
		expect(data.week).toBe(3);
		expect(data.events.map((row) => row.title)).toEqual(['Fixture']);
	}
	expect(
		(await getCalendar(database, user, { week: '0' }, now)).events.map((row) => row.title)
	).toEqual(['First']);
	expect((await getCalendar(database, user, { week: '2' }, now)).events).toEqual([]);
});
it.each(['0x2', '1e0', ' 2 ', '', '1.5', '100000'])(
	'rejects invalid week query values (%s)',
	async (week) => {
		await expect(getCalendar(database, user, { week }, now)).rejects.toThrow();
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	}
);
it.each([6, 7])('adds only the weekend columns that contain events (%s)', async (weekday) => {
	expect((await getCalendar(database, user, {}, now)).days.map((day) => day.weekday)).toEqual([
		1, 2, 3, 4, 5
	]);
	await event({ weekday });
	expect((await getCalendar(database, user, {}, now)).days.map((day) => day.weekday)).toEqual([
		1,
		2,
		3,
		4,
		5,
		weekday
	]);
	await event({ weekday: weekday === 6 ? 7 : 6 });
	expect((await getCalendar(database, user, {}, now)).days.map((day) => day.weekday)).toEqual([
		1, 2, 3, 4, 5, 6, 7
	]);
});
it('orders events, computes pool and fixed dates, and returns local times without seconds', async () => {
	await client`UPDATE settings SET pool_start='2026-12-30' WHERE id=1`;
	const late = await event({ weekday: 2, startTime: '11:00', endTime: '12:00' });
	const early = await event({
		weekday: 2,
		startTime: '08:00',
		endTime: '09:00',
		eventDate: '2099-01-01'
	});
	const data = await getCalendar(database, user, {}, now);
	expect(data.events.map((row) => row.id)).toEqual([early.id, late.id]);
	expect(data.events.map((row) => row.date)).toEqual(['2099-01-01', '2027-01-14']);
	expect(data.events[0].startTime).toBe('08:00');
	expect(data.days[0].date).toBe('2027-01-13');
});
it('redacts absent identities for users, counts them, and keeps own absent registration state', async () => {
	const row = await event();
	await database.insert(schema.registrations).values([
		{ eventId: row.id, participantLogin: user.login, attended: false },
		{ eventId: row.id, participantLogin: 'hidden_absent', attended: false },
		{ eventId: row.id, participantLogin: 'visible', attended: true }
	]);
	const ordinary = await getCalendar(database, user, {}, now);
	expect(ordinary.events[0]).toMatchObject({
		state: 'registered',
		registeredCount: 3,
		maxSlots: 2,
		participants: [{ participantLogin: 'visible', attended: true }]
	});
	expect(JSON.stringify(ordinary)).not.toContain('hidden_absent');
	const staff = await getCalendar(database, admin, {}, now);
	expect(staff.events[0].participants).toHaveLength(3);
	expect(staff.events[0].state).toBe('full');
});
it('uses passed, registered, full, available precedence and strict end-time comparison', async () => {
	const passed = await event({ eventDate: '2026-10-20', maxSlots: 1 });
	const exact = await event({ eventDate: '2026-10-21', endTime: '12:00', maxSlots: 1 });
	const full = await event({ maxSlots: 1 });
	const available = await event();
	await database.insert(schema.registrations).values([
		{ eventId: passed.id, participantLogin: user.login },
		{ eventId: exact.id, participantLogin: user.login },
		{ eventId: full.id, participantLogin: 'other', attended: false }
	]);
	let data = await getCalendar(database, user, {}, now);
	const states = new Map(data.events.map((row) => [row.id, row.state]));
	expect([
		states.get(passed.id),
		states.get(exact.id),
		states.get(full.id),
		states.get(available.id)
	]).toEqual(['passed', 'registered', 'full', 'available']);
	data = await getCalendar(database, user, {}, new Date(now.getTime() + 1));
	expect(data.events.find((row) => row.id === exact.id)?.state).toBe('passed');
});
it('serves fixed dates or pool dates and returns 409 with the dedicated message when neither exists', async () => {
	const row = await event();
	await expect(downloadIcs(database, user, String(row.id), now)).rejects.toMatchObject({
		status: 409,
		body: {
			message: "Impossibile determinare la data dell'evento. Impostare la data di inizio pool."
		}
	});
	await client`UPDATE settings SET pool_start='2027-01-04' WHERE id=1`;
	expect((await downloadIcs(database, user, String(row.id), now)).content).toContain(
		'DTSTART;TZID=Europe/Rome:20270118T090000'
	);
	await client`UPDATE events SET event_date='2027-02-01' WHERE id=${row.id}`;
	expect((await downloadIcs(database, admin, row.id, now)).content).toContain(
		'DTSTART;TZID=Europe/Rome:20270201T090000'
	);
});
it('returns ICS attachment headers, 404 for missing events and 400 for invalid ids', async () => {
	const row = await event({ eventDate: '2027-01-04' });
	const request = (id: string) =>
		GET({ locals: { user }, params: { id } } as Parameters<typeof GET>[0]);
	const response = await request(String(row.id));
	expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
	expect(response.headers.get('Content-Disposition')).toBe(
		`attachment; filename="evento_${row.id}.ics"`
	);
	expect(await response.text()).toContain('BEGIN:VCALENDAR');
	await expect(request('999')).rejects.toMatchObject({ status: 404 });
	for (const id of ['0', '0x2', '1e0', ' 2 ', '2147483648'])
		await expect(request(id)).rejects.toMatchObject({ status: 400 });
});
it('requires authentication in both calendar and ICS domains without writes', async () => {
	await expect(getCalendar(database, null, {}, now)).rejects.toMatchObject({ status: 401 });
	await expect(downloadIcs(database, null, '1', now)).rejects.toMatchObject({ status: 401 });
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('returns the registered id only after a successful action and keeps failure responses intact', async () => {
	const row = await event({ eventDate: '2099-01-01' });
	await database.insert(schema.whitelist).values({ login: user.login });
	const post = () =>
		actions.register!({
			locals: { user },
			request: new Request('http://localhost:4173/calendar?/register', {
				method: 'POST',
				body: new URLSearchParams({ id: String(row.id) })
			}),
			getClientAddress: () => '127.0.0.1'
		} as Parameters<NonNullable<typeof actions.register>>[0]);
	expect(await post()).toMatchObject({ ok: true, registeredEventId: row.id });
	const duplicate = await post();
	expect(duplicate).toMatchObject({
		status: 400,
		data: { ok: false, messages: [{ key: 'error_already_registered' }] }
	});
	expect(duplicate).not.toHaveProperty('registeredEventId');
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});

it('hides future-week ICS from users while preserving admin access', async () => {
	const future = await event({ week: 4, eventDate: '2099-01-01' });
	await expect(downloadIcs(database, user, future.id, now)).rejects.toMatchObject({
		status: 404,
		body: { message: 'Evento non trovato' }
	});
	const response = await GET({
		locals: { user: admin },
		params: { id: String(future.id) }
	} as Parameters<typeof GET>[0]);
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('SUMMARY:Fixture');
});
