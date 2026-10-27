import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import { calendarPoolView, getRecap, personalPools } from '../../src/lib/server/domain/recap.ts';
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
let user: User, admin: User;
beforeEach(async () => {
	await client`TRUNCATE users,events,registrations,pools,action_logs RESTART IDENTITY CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null WHERE id=1`;
	[user, admin] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'student' },
			{ intraId: 2, login: 'staff', role: 'admin' }
		])
		.returning();
});
afterAll(async () => {
	await client`TRUNCATE users,events,registrations,pools,action_logs CASCADE`;
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null WHERE id=1`;
	await client.end();
});
async function archive(source: 'site' | 'csv' = 'site', startDate = '2026-05-04') {
	const [pool] = await database
		.insert(schema.pools)
		.values({ startDate, source, archivedAt: new Date() })
		.returning();
	await database.insert(schema.poolEntries).values(
		['student', 'secret_other'].map((login) => ({
			poolId: pool.id,
			login,
			title: login === 'student' ? 'Exam' : 'Secret title',
			kind: 'exam' as const,
			eventDate: startDate,
			weekday: 1,
			durationMinutes: 60,
			compensation: 200,
			attended: true
		}))
	);
	return pool;
}
it('lists only personal pools and redacts other students from the full serialized recap', async () => {
	const pool = await archive();
	const [unrelated] = await database
		.insert(schema.pools)
		.values({ startDate: '2025-01-01', source: 'csv', archivedAt: new Date() })
		.returning();
	expect(await personalPools(database, user)).toEqual([{ id: pool.id, startDate: pool.startDate }]);
	const recap = await getRecap(database, user, String(pool.id));
	expect(recap?.stats).toMatchObject({ taken: 1, contributionPercent: 50, busiestWeek: 1 });
	expect(recap?.totals).toMatchObject({ taken: 2, participants: 2 });
	expect(JSON.stringify(recap)).not.toContain('secret_other');
	expect(JSON.stringify(recap)).not.toContain('Secret title');
	expect(await getRecap(database, user, String(unrelated.id))).toBeNull();
	expect(await getRecap(database, user)).toEqual(recap);
	await expect(getRecap(database, user, String(pool.id), true)).rejects.toMatchObject({
		status: 403
	});
	await expect(getRecap(database, null, String(pool.id))).rejects.toMatchObject({ status: 401 });
	await expect(getRecap(database, user, '2147483647')).rejects.toMatchObject({ status: 404 });
});
it('serves anonymous aggregates to staff and skips unknown CSV weeks and times', async () => {
	const pool = await archive('csv');
	const personal = await getRecap(database, user, String(pool.id));
	expect(personal?.stats).toMatchObject({
		busiestWeek: null,
		weekCounts: null,
		favoriteTimeBand: null
	});
	expect(personal?.overall).toMatchObject({ pools: 1, completed: 1, favoriteKind: 'exam' });
	expect(personal?.stats?.badges).toContain('debutant');
	const whole = await getRecap(database, admin, String(pool.id), true);
	expect(whole?.stats).toBeNull();
	expect(whole?.overall).toBeNull();
	expect(whole?.totals.taken).toBe(2);
	expect(JSON.stringify(whole)).not.toContain('student');
	expect(JSON.stringify(whole)).not.toContain('Secret title');
});
it('uses live data when finished, latest personal archive when unset, and avoids duplicate profile pools', async () => {
	const pool = await archive();
	await client`UPDATE settings SET pool_start='2026-05-04',pool_end='2026-05-31' WHERE id=1`;
	const [event] = await database
		.insert(schema.events)
		.values({ title: 'Live corrected', week: 1, weekday: 1, startTime: '09:00', endTime: '11:00' })
		.returning();
	await database
		.insert(schema.registrations)
		.values({ eventId: event.id, participantLogin: user.login });
	expect(await personalPools(database, user)).toHaveLength(1);
	const finished = await calendarPoolView(database, user, new Date('2026-06-01T12:00:00Z'));
	expect(finished).toMatchObject({
		phase: 'closed',
		calendar: false,
		recap: true,
		recapData: { stats: { hours: 2, firstShift: { title: 'Live corrected' } } }
	});
	await client`UPDATE settings SET pool_start='2026-10-19',pool_end='2026-11-15' WHERE id=1`;
	const upcoming = await calendarPoolView(database, user, new Date('2026-10-18T12:00:00Z'));
	// The prior archive is shown under the countdown even when the new pool already has registrations.
	expect(upcoming).toMatchObject({
		phase: 'upcoming',
		calendar: false,
		countdown: true,
		recap: true,
		recapData: { startDate: pool.startDate }
	});
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null WHERE id=1`;
	const none = await calendarPoolView(database, user, new Date());
	expect(none).toMatchObject({
		phase: 'none',
		calendar: false,
		recapData: { startDate: pool.startDate }
	});
});

it('keeps the closed recap available from the archive after events have been cleaned', async () => {
	const pool = await archive();
	await client`UPDATE settings SET pool_start='2026-05-04',pool_end='2026-05-31',pool_closed_at='2026-06-01T12:00:00Z' WHERE id=1`;
	const view = await calendarPoolView(database, user, new Date('2026-06-01T12:00:00Z'));
	expect(view).toMatchObject({ phase: 'closed', calendar: false, recap: true });
	expect(view.recapData).toEqual(await getRecap(database, user, String(pool.id)));
	expect(JSON.stringify(view)).not.toContain('secret_other');
});
