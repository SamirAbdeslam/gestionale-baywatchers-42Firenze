import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { getProfile, getParticipants } from '../../src/lib/server/domain/reports.ts';
import { load } from '../../src/routes/profile/+page.server.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
let actor: User, admin: User;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	await client`UPDATE settings SET pool_start='2026-10-26',pool_end='2026-11-22',active_week=1 WHERE id=1`;
	[actor, admin] = await database
		.insert(schema.users)
		.values([
			{
				intraId: 1,
				login: 'student',
				displayName: 'Student Name',
				imageUrl: '/badge.png',
				wallet: 842,
				role: 'user'
			},
			{ intraId: 2, login: 'staff', role: 'admin', wallet: 123 }
		])
		.returning();
});
afterAll(async () => {
	await truncate();
	await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
	await client.end();
});
async function fixture() {
	const events = await database
		.insert(schema.events)
		.values([
			{
				title: 'Other user only',
				week: 1,
				weekday: 1,
				startTime: '09:00',
				endTime: '11:00',
				compensation: 999
			},
			{
				title: 'Later',
				week: 1,
				weekday: 1,
				startTime: '11:00',
				endTime: '11:20',
				compensation: 25
			},
			{
				title: 'First',
				week: 1,
				weekday: 1,
				eventDate: '2027-01-04',
				startTime: '09:00',
				endTime: '09:20',
				compensation: 25
			},
			{
				title: 'Weekend',
				week: 4,
				weekday: 7,
				startTime: '10:00',
				endTime: '10:20',
				compensation: 25
			},
			{
				title: 'Absent',
				week: 2,
				weekday: 6,
				startTime: '12:00',
				endTime: '16:00',
				compensation: 500
			}
		])
		.returning();
	await database.insert(schema.registrations).values(
		events.map((event, index) => ({
			eventId: event.id,
			participantLogin: index === 0 ? admin.login : actor.login,
			attended: index !== 4
		}))
	);
}
it('loads only the authenticated user, all registrations and earned totals, sorted by week/day/start', async () => {
	await fixture();
	const result = await getProfile(database, actor);
	expect(result.user).toEqual({
		login: actor.login,
		displayName: 'Student Name',
		imageUrl: '/badge.png',
		wallet: 842
	});
	expect(result).toMatchObject({ totalEvents: 4, hours: 1, altarian: 75 });
	expect(result.weeks.map((week) => week.week)).toEqual([1, 2, 4]);
	expect(result.weeks[0].events.map((event) => event.title)).toEqual(['First', 'Later']);
	expect(result.weeks[0].events.map((event) => event.date)).toEqual(['2027-01-04', '2026-10-26']);
	expect(result.weeks[1].events[0]).toMatchObject({
		title: 'Absent',
		attended: false,
		compensation: 500,
		weekday: 6
	});
	expect(result.weeks[2].events[0]).toMatchObject({ date: '2026-11-22', weekday: 7 });
	expect(JSON.stringify(result)).not.toContain('Other user only');
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	await expect(getParticipants(database, actor)).rejects.toMatchObject({ status: 403 });
});
it('uses one decimal for profile hours and does not change administrative precision', async () => {
	await fixture();
	await client`DELETE FROM registrations WHERE event_id IN (SELECT id FROM events WHERE title IN ('First','Weekend'))`;
	expect(await getProfile(database, actor)).toMatchObject({
		totalEvents: 2,
		hours: 0.3,
		altarian: 25
	});
	expect((await getParticipants(database, admin, actor.login))[0]).toMatchObject({
		events: 1,
		hours: 0.33,
		altarian: 25
	});
});
it('shows all-absent bookings with zero earned totals', async () => {
	await fixture();
	await client`UPDATE registrations SET attended=false WHERE participant_login=${actor.login}`;
	expect(await getProfile(database, actor)).toMatchObject({
		totalEvents: 4,
		hours: 0,
		altarian: 0
	});
});
it('handles a new user with no bookings and missing optional identity fields', async () => {
	const result = await getProfile(database, {
		...actor,
		displayName: null,
		imageUrl: null,
		wallet: 0
	});
	expect(result).toEqual({
		user: { login: actor.login, displayName: null, imageUrl: null, wallet: 0 },
		totalEvents: 0,
		hours: 0,
		altarian: 0,
		weeks: []
	});
});
it('restricts admin profiles to their own bookings too', async () => {
	await fixture();
	const result = await getProfile(database, admin);
	expect(result).toMatchObject({
		user: { login: 'staff', wallet: 123 },
		totalEvents: 1,
		hours: 2,
		altarian: 999
	});
	expect(result.weeks.flatMap((week) => week.events).map((event) => event.title)).toEqual([
		'Other user only'
	]);
});
it('formats the own profile load, ignores target-user query parameters and preserves null dates', async () => {
	await fixture();
	await client`UPDATE settings SET pool_start=null WHERE id=1`;
	const event = {
		locals: { user: actor },
		url: new URL('http://localhost/profile?login=staff&userId=2')
	};
	const result = await load(event as unknown as Parameters<typeof load>[0]);
	expect(result).toMatchObject({ profile: { user: { login: 'student' }, totalEvents: 4 } });
	assert(result);
	expect(result.profile.weeks[0].events[0].formattedDate).toBe('4 Gen');
	expect(result.profile.weeks[0].events[1].formattedDate).toBe('');
	expect(JSON.stringify(result)).not.toContain('Other user only');
});
it('requires authentication even when called directly', async () => {
	await expect(getProfile(database, null)).rejects.toMatchObject({ status: 401 });
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
