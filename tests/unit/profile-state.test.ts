import { expect, it } from 'vitest';
import { getProfile } from '../../src/lib/server/domain/reports.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
it('reports future, present and absent bookings with a strict Rome end-time boundary', async () => {
	const rows = [
		{ title: 'Future', endTime: '15:00', attended: true },
		{ title: 'Present', endTime: '13:00', attended: true },
		{ title: 'Absent', endTime: '13:00', attended: false },
		{ title: 'Exactly now', endTime: '14:00', attended: true }
	].map((row) => ({
		...row,
		participantLogin: 'self',
		week: 1,
		weekday: 4,
		eventDate: '2026-10-22',
		startTime: '12:00',
		compensation: 100,
		registeredAt: new Date()
	}));
	let reads = 0;
	const database = {
		select: () => ({
			from: () =>
				++reads === 1
					? { where: async () => [{ poolStart: null }] }
					: { innerJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }
		})
	} as unknown as Parameters<typeof getProfile>[0];
	const profile = await getProfile(
		database,
		{ login: 'self', role: 'user' } as User,
		new Date('2026-10-22T12:00:00Z')
	);
	expect(
		profile.weeks[0].events.map(({ title, passed, attended }) => ({ title, passed, attended }))
	).toEqual([
		{ title: 'Future', passed: false, attended: true },
		{ title: 'Present', passed: true, attended: true },
		{ title: 'Absent', passed: true, attended: false },
		{ title: 'Exactly now', passed: false, attended: true }
	]);
	expect(profile).toMatchObject({ totalEvents: 4, hours: 6, altarian: 300 });
});
