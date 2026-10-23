import { expect, it, vi } from 'vitest';
import { getCalendar } from '../../src/lib/server/domain/calendar.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
vi.mock('../../src/lib/server/domain/events.ts', () => ({
	readWeekEvents: vi.fn().mockResolvedValue([])
}));
it.each([0, 3])('returns the already loaded weekly limit %s', async (maxEventsPerUser) => {
	const where = vi.fn().mockResolvedValue([{ activeWeek: 1, poolStart: null, maxEventsPerUser }]);
	const database = { select: () => ({ from: () => ({ where }) }) } as unknown as Parameters<
		typeof getCalendar
	>[0];
	const result = await getCalendar(
		database,
		{ login: 'self', role: 'user' } as User,
		{},
		new Date('2026-10-22T12:00:00Z')
	);
	expect(result.maxEventsPerUser).toBe(maxEventsPerUser);
	expect(where).toHaveBeenCalledTimes(1);
});

it('retains own registration status when a passed absence is redacted', async () => {
	const { readWeekEvents } = await import('../../src/lib/server/domain/events.ts');
	vi.mocked(readWeekEvents).mockResolvedValueOnce([
		{
			id: 1,
			title: 'Past absence',
			kind: 'custom',
			weekday: 1,
			eventDate: '2020-01-06',
			week: 1,
			startTime: '09:00',
			endTime: '10:00',
			compensation: 200,
			maxSlots: 1,
			participants: [{ participantLogin: 'self', attended: false }]
		}
	] as Awaited<ReturnType<typeof readWeekEvents>>);
	const database = {
		select: () => ({
			from: () => ({ where: async () => [{ activeWeek: 1, poolStart: null, maxEventsPerUser: 3 }] })
		})
	} as unknown as Parameters<typeof getCalendar>[0];
	const data = await getCalendar(
		database,
		{ login: 'self', role: 'user' } as User,
		{},
		new Date('2026-10-22T12:00:00Z')
	);
	expect(data.events[0]).toMatchObject({ isRegistered: true, state: 'passed', participants: [] });
});
