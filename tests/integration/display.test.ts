import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { advanceDisplayWeek, getDisplay } from '../../src/lib/server/domain/display.ts';
import { load as displayLoad } from '../../src/routes/display/+page.server.ts';
import { load as adminLoad } from '../../src/routes/admin/+page.server.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => environment }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-21T10:00:00Z');
const token = 'private-display-token-123456';
const environment = {
	ORIGIN: 'https://localhost:8443',
	DISPLAY_TOKEN: '',
	DISPLAY_REDIRECT_URL: '',
	DISPLAY_REDIRECT_SECONDS: 30
};
let user: User, admin: User;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	await client`UPDATE settings SET pool_start=null,pool_end=null,active_week=3,display_week=1,max_events_per_user=0,updated_at='2020-01-01' WHERE id=1`;
	[user, admin] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'student', role: 'user' },
			{ intraId: 2, login: 'staff', role: 'admin' }
		])
		.returning();
	Object.assign(environment, {
		DISPLAY_TOKEN: '',
		DISPLAY_REDIRECT_URL: '',
		DISPLAY_REDIRECT_SECONDS: 30
	});
});
afterAll(async () => {
	await truncate();
	await client`UPDATE settings SET pool_start=null,pool_end=null,active_week=1,display_week=1 WHERE id=1`;
	await client.end();
});
async function event(values: Partial<typeof schema.events.$inferInsert> = {}) {
	const [row] = await database
		.insert(schema.events)
		.values({
			title: 'Fixture',
			week: 1,
			weekday: 1,
			startTime: '09:00',
			endTime: '10:00',
			maxSlots: 2,
			...values
		})
		.returning();
	return row;
}
it('serializes concurrent empty-week advances, one step per request, capped at four', async () => {
	await client`UPDATE settings SET pool_start='2026-10-19' WHERE id=1`;
	const results = await Promise.all([
		advanceDisplayWeek(database, now),
		advanceDisplayWeek(database, now)
	]);
	expect(results.map((row) => row.displayWeek).sort()).toEqual([2, 3]);
	expect((await advanceDisplayWeek(database, now)).displayWeek).toBe(4);
	expect((await advanceDisplayWeek(database, now)).displayWeek).toBe(4);
	const [config] = await client`SELECT * FROM settings WHERE id=1`;
	expect(config.active_week).toBe(3);
	expect(new Date(config.updated_at)).toEqual(now);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('keeps settings untouched when dates are unset or events have not all ended', async () => {
	const [before] = await database.select().from(schema.settings);
	expect(await advanceDisplayWeek(database, now)).toEqual(before);
	await client`UPDATE settings SET pool_start='2026-10-19' WHERE id=1`;
	await event({ eventDate: '2099-01-01' });
	await event({ week: 2 });
	expect((await advanceDisplayWeek(database, now)).displayWeek).toBe(1);
	const [config] = await client`SELECT updated_at FROM settings WHERE id=1`;
	expect(new Date(config.updated_at)).toEqual(before.updatedAt);
});
it('advances ended weeks to a populated next week before reading the display', async () => {
	await client`UPDATE settings SET pool_start='2026-10-19' WHERE id=1`;
	await event({ title: 'Ended' });
	await event({ week: 2, title: 'Next' });
	const data = await getDisplay(database, null, {}, '', now);
	expect(data.week).toBe(2);
	expect(data.events.map((row) => row.title)).toEqual(['Next']);
	expect(data.days[0].date).toBe('2026-10-26');
});
it('uses displayWeek independently of activeWeek and ignores query week', async () => {
	await event();
	await event({ week: 3, title: 'Not displayed' });
	const data = await getDisplay(database, null, { week: '3' }, '', now);
	expect(data.week).toBe(1);
	expect(data.events.map((row) => row.title)).toEqual(['Fixture']);
});
it.each([6, 7])('shows only populated weekend columns (%s) and orders times', async (weekday) => {
	const late = await event({ weekday, startTime: '12:00', endTime: '13:00' });
	const early = await event({ weekday, eventDate: '2099-01-01' });
	const data = await getDisplay(database, null, {}, '', now);
	expect(data.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, weekday]);
	expect(data.events.map((row) => row.id)).toEqual([early.id, late.id]);
	expect(data.events[0]).toMatchObject({
		date: '2099-01-01',
		startTime: '09:00',
		endTime: '10:00'
	});
});
it('counts all registrations but never discloses absent identities, including to admins', async () => {
	const row = await event({ maxSlots: 1 });
	await database.insert(schema.registrations).values([
		{ eventId: row.id, participantLogin: 'present' },
		{ eventId: row.id, participantLogin: 'hidden_absent', attended: false }
	]);
	for (const actor of [null, user, admin]) {
		const data = await getDisplay(database, actor, {}, '', now);
		expect(data.events[0]).toMatchObject({
			freeSlots: -1,
			state: 'full',
			participants: ['present']
		});
		const json = JSON.stringify(data);
		expect(json).not.toContain('hidden_absent');
		expect(json).not.toContain('registeredAt');
		expect(json).not.toContain('participantLogin');
	}
});
it('uses passed before full or available, including the exact end boundary', async () => {
	const past = await event({ eventDate: '2000-01-01', maxSlots: 1 });
	const exact = await event({ eventDate: '2026-10-21', endTime: '12:00' });
	await database
		.insert(schema.registrations)
		.values({ eventId: past.id, participantLogin: 'present' });
	let data = await getDisplay(database, null, {}, '', now);
	expect(data.events.find((row) => row.id === past.id)?.state).toBe('passed');
	expect(data.events.find((row) => row.id === exact.id)?.state).toBe('available');
	data = await getDisplay(database, null, {}, '', new Date(now.getTime() + 1));
	expect(data.events.find((row) => row.id === exact.id)?.state).toBe('passed');
});
it.each([undefined, '', 'short', 'x'.repeat(token.length)])(
	'returns generic 404 before any read-driven advance with invalid token (%s)',
	async (actual) => {
		await client`UPDATE settings SET pool_start='2026-10-19' WHERE id=1`;
		const [before] = await database.select().from(schema.settings);
		for (const actor of [null, user])
			await expect(
				getDisplay(database, actor, { token: actual }, token, now)
			).rejects.toMatchObject({ status: 404, body: { message: 'Pagina non trovata' } });
		expect(await database.select().from(schema.settings)).toEqual([before]);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	}
);
it('accepts the exact token or an admin session without returning the configured token', async () => {
	for (const [actor, input] of [
		[null, { token }],
		[user, { token }],
		[admin, {}]
	] as const) {
		const data = await getDisplay(database, actor, input, token, now);
		expect(data.week).toBe(1);
		expect(JSON.stringify(data)).not.toContain(token);
	}
});
it('loads native redirect configuration and exposes the complete encoded TV URL only to admins', async () => {
	environment.DISPLAY_TOKEN = token + '&?';
	environment.DISPLAY_REDIRECT_URL = 'https://example.org/tv?x=1&y=2';
	environment.DISPLAY_REDIRECT_SECONDS = 5;
	const depends = vi.fn();
	const display = await displayLoad({
		locals: { user: null },
		url: new URL(
			'https://localhost:8443/display?token=' + encodeURIComponent(environment.DISPLAY_TOKEN)
		),
		depends
	} as unknown as Parameters<typeof displayLoad>[0]);
	expect(display).toMatchObject({
		redirectUrl: environment.DISPLAY_REDIRECT_URL,
		redirectSeconds: 5
	});
	expect(depends).toHaveBeenCalledWith('app:display');
	const load = (actor: User | null) =>
		adminLoad({
			locals: { user: actor },
			url: new URL('https://localhost:8443/admin'),
			depends: vi.fn()
		} as unknown as Parameters<typeof adminLoad>[0]);
	const data = await load(admin);
	expect(data).toHaveProperty(
		'displayUrl',
		'https://localhost:8443/display?token=' + encodeURIComponent(environment.DISPLAY_TOKEN)
	);
	await expect(load(user)).rejects.toMatchObject({ status: 403 });
	await expect(load(null)).rejects.toMatchObject({ status: 401 });
});
