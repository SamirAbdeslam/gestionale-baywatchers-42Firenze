import { expect, it } from 'vitest';
import { calendarView } from '../../src/lib/server/domain/recap.ts';
it.each([
	['none', { countdown: false, calendar: false, recap: true }],
	['upcoming', { countdown: true, calendar: false, recap: false }],
	['active', { countdown: false, calendar: true, recap: false }],
	['finished', { countdown: false, calendar: true, recap: true }]
] as const)('chooses the %s calendar view', (phase, view) => {
	expect(calendarView(phase)).toEqual(view);
});
