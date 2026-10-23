import { expect, it, vi } from 'vitest';
import { getDisplay } from '../../src/lib/server/domain/display.ts';
import { readWeekEvents } from '../../src/lib/server/domain/events.ts';
vi.mock('../../src/lib/server/domain/events.ts', () => ({ readWeekEvents: vi.fn() }));
it('includes absent bookings in taken seats while keeping their logins private', async () => {
	vi.mocked(readWeekEvents).mockResolvedValueOnce([
		{
			id: 1,
			title: 'Display',
			kind: 'exam',
			weekday: 1,
			week: 1,
			eventDate: null,
			startTime: '09:00',
			endTime: '10:00',
			compensation: 200,
			maxSlots: 3,
			participants: [
				{ participantLogin: 'visible', attended: true },
				{ participantLogin: 'private_absent', attended: false }
			]
		}
	] as Awaited<ReturnType<typeof readWeekEvents>>);
	const tx = {
		select: vi
			.fn()
			.mockReturnValueOnce({
				from: () => ({ where: () => ({ for: async () => [{ poolStart: null, displayWeek: 1 }] }) })
			})
			.mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
	};
	const database = {
		transaction: async (run: (transaction: typeof tx) => unknown) => run(tx)
	} as unknown as Parameters<typeof getDisplay>[0];
	const data = await getDisplay(database, null, {}, '', new Date('2026-10-22T12:00:00Z'));
	const event = data.events[0];
	expect(event).toMatchObject({ maxSlots: 3, freeSlots: 1, participants: ['visible'] });
	expect(event.maxSlots - event.freeSlots).toBe(2);
	expect(event).not.toHaveProperty('registeredCount');
	expect(JSON.stringify(data)).not.toContain('private_absent');
});
