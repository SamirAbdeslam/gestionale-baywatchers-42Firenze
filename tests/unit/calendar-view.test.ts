import { expect, it } from 'vitest';
import { calendarTotals } from '../../src/lib/calendar-view.ts';
it('counts passed absences toward the limit without awarding their compensation', () => {
	const absent = { isRegistered: true, state: 'passed', compensation: 200, participants: [] };
	expect(calendarTotals([absent], 'self')).toEqual({ count: 1, compensation: 0 });
	expect(
		calendarTotals(
			[
				absent,
				{ ...absent, participants: [{ participantLogin: 'self', attended: false }] },
				{ ...absent, participants: [{ participantLogin: 'self', attended: true }] },
				{ ...absent, state: 'registered' },
				{ ...absent, isRegistered: false }
			],
			'self'
		)
	).toEqual({ count: 4, compensation: 400 });
});
