import { describe, expect, it } from 'vitest';
import {
	addDays,
	formatEventDate,
	computeWeekDayDates,
	concreteDate,
	isPassed,
	setPoolDates
} from '../../src/lib/server/domain/dates.ts';
import { capitalizeFirst, inferKind, PRESETS } from '../../src/lib/server/domain/kinds.ts';
import { participantTotals } from '../../src/lib/server/domain/reports.ts';

describe('pool and concrete dates', () => {
	it('keeps non-Monday starts and crosses months and leap days', () => {
		expect(computeWeekDayDates('2024-02-28', 1)).toEqual([
			'2024-02-28',
			'2024-02-29',
			'2024-03-01',
			'2024-03-02',
			'2024-03-03',
			'2024-03-04',
			'2024-03-05'
		]);
		expect(concreteDate({ eventDate: null, week: 4, weekday: 7 }, '2026-12-15')).toBe('2027-01-11');
		expect(concreteDate({ eventDate: '2026-01-01', week: 2, weekday: 3 }, null)).toBe('2026-01-01');
		expect(computeWeekDayDates(null, 1)).toEqual(Array(7).fill(null));
		expect(setPoolDates('2026-12-15')).toEqual({ poolStart: '2026-12-15', poolEnd: '2027-01-11' });
		expect(() => setPoolDates('2026-01-01', '2025-12-31')).toThrow();
		expect(() => addDays('2026-02-29', 1)).toThrow();
	});
	it.each([
		['2026-01-10', '2026-01-10T10:00:00Z', false],
		['2026-01-10', '2026-01-10T10:00:00.001Z', true],
		['2026-07-10', '2026-07-10T09:00:00Z', false],
		['2026-07-10', '2026-07-10T09:01:00Z', true],
		['2026-03-29', '2026-03-29T09:01:00Z', true],
		['2026-10-25', '2026-10-25T10:01:00Z', true]
	])('compares Rome wall time strictly after end (%s, %s)', (date, now, expected) => {
		expect(isPassed(date, '11:00', new Date(now))).toBe(expected);
		expect(isPassed(null, '11:00', new Date(now))).toBe(false);
	});
});
it.each([
	['ESAME Icebreaker', 'exam'],
	['sorveglianza', 'exam'],
	['Icebreaker rush', 'icebreaker'],
	['CORREZIONI cluster', 'rush'],
	['Presenza accoglienza', 'cluster'],
	['Accoglienza', 'welcome'],
	['Laboratorio', 'custom']
])('infers %s in specified precedence', (title, kind) => expect(inferKind(title)).toBe(kind));
it('preserves capitalization after the first letter and preset compensation', () => {
	expect(capitalizeFirst('èVento API')).toBe('ÈVento API');
	expect(capitalizeFirst('')).toBe('');
	expect(Object.values(PRESETS).map((p) => p.compensation)).toEqual([200, 150, 300, 100, 300]);
});
it('totals only attendance and rounds hours after summing minutes', () => {
	expect(
		participantTotals([
			{
				participantLogin: 'a',
				attended: true,
				startTime: '09:00:00',
				endTime: '10:20:00',
				compensation: 100
			},
			{
				participantLogin: 'a',
				attended: true,
				startTime: '11:00',
				endTime: '11:20',
				compensation: 50
			},
			{
				participantLogin: 'a',
				attended: false,
				startTime: '09:00',
				endTime: '18:00',
				compensation: 999
			},
			{
				participantLogin: 'b',
				attended: false,
				startTime: '09:00',
				endTime: '18:00',
				compensation: 999
			}
		])
	).toEqual([
		{ login: 'a', events: 2, hours: 1.67, altarian: 150 },
		{ login: 'b', events: 0, hours: 0, altarian: 0 }
	]);
});

it('formats short dates with the requested locale', () => {
	expect(formatEventDate('2026-10-15', 'it')).toBe('15 Ott');
	expect(formatEventDate('2026-10-15', 'en')).toBe('Oct 15');
	expect(formatEventDate(null, 'it')).toBe('');
});
