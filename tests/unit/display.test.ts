import { expect, it } from 'vitest';
import { displayStates, nextDisplayWeek } from '../../src/lib/server/domain/display.ts';
const now = new Date('2026-10-21T10:00:00Z');
const config = { poolStart: '2026-10-19', displayWeek: 1 };
const event = { week: 1, weekday: 1, eventDate: null, endTime: '10:00' };
it('does not advance without pool dates, even with past fixed events', () => {
	expect(nextDisplayWeek({ ...config, poolStart: null }, [], now)).toBe(1);
	expect(
		nextDisplayWeek({ ...config, poolStart: null }, [{ ...event, eventDate: '2000-01-01' }], now)
	).toBe(1);
});
it('advances empty weeks only once per request and stops at week four', () => {
	for (const displayWeek of [1, 2, 3, 4])
		expect(nextDisplayWeek({ ...config, displayWeek }, [], now)).toBe(Math.min(4, displayWeek + 1));
});
it('advances completed weeks only when the immediate next week has events', () => {
	expect(nextDisplayWeek(config, [event], now)).toBe(1);
	expect(nextDisplayWeek(config, [event, { ...event, week: 3 }], now)).toBe(1);
	expect(nextDisplayWeek(config, [event, { ...event, week: 2 }], now)).toBe(2);
});
it('keeps a week with any future event and honors fixed dates over pool dates', () => {
	const next = { ...event, week: 2 };
	expect(nextDisplayWeek(config, [event, next, { ...event, eventDate: '2099-01-01' }], now)).toBe(
		1
	);
	expect(nextDisplayWeek(config, [{ ...event, weekday: 7 }, next], now)).toBe(1);
	expect(
		nextDisplayWeek(config, [{ ...event, weekday: 7, eventDate: '2000-01-01' }, next], now)
	).toBe(2);
});
it('compares event end strictly in Europe/Rome', () => {
	const events = [
		{ ...event, weekday: 3, endTime: '12:00' },
		{ ...event, week: 2 }
	];
	expect(nextDisplayWeek(config, events, now)).toBe(1);
	expect(nextDisplayWeek(config, events, new Date(now.getTime() + 1))).toBe(2);
});

const timedEvent = {
	id: 1,
	date: '2026-10-21',
	startTime: '12:00:00',
	endTime: '13:00:00',
	freeSlots: 0
};
it.each([
	['2026-10-21T09:59:59.999Z', 'next'],
	['2026-10-21T10:00:00Z', 'ongoing'],
	['2026-10-21T10:30:00Z', 'ongoing'],
	['2026-10-21T11:00:00Z', 'ongoing'],
	['2026-10-21T11:00:00.001Z', 'passed']
])('classifies display events at %s as %s', (instant, state) => {
	expect(displayStates([timedEvent], new Date(instant))).toEqual([state]);
});
it('selects one next event by concrete date, start and id, keeping other availability states', () => {
	const candidates = [
		{ ...timedEvent, id: 5, date: '2026-10-23', freeSlots: 2 },
		{ ...timedEvent, id: 4, date: '2026-10-22' },
		{ ...timedEvent, id: 3, date: '2026-10-22' },
		{ ...timedEvent, id: 2, date: '2026-10-22', startTime: '14:00', endTime: '15:00' },
		{ ...timedEvent, id: 6, date: null, freeSlots: 2 },
		{ ...timedEvent, id: 7, date: null }
	];
	expect(displayStates(candidates, now)).toEqual([
		'available',
		'full',
		'next',
		'full',
		'available',
		'full'
	]);
});
it('marks every overlapping event ongoing and no next when none remain', () => {
	expect(
		displayStates([timedEvent, { ...timedEvent, id: 2 }], new Date('2026-10-21T10:30:00Z'))
	).toEqual(['ongoing', 'ongoing']);
	expect(displayStates([], now)).toEqual([]);
});
it.each([
	['2026-03-29', '2026-03-29T00:59:59.999Z', 'next'],
	['2026-03-29', '2026-03-29T01:00:00Z', 'ongoing'],
	['2026-03-29', '2026-03-29T02:00:00.001Z', 'passed'],
	['2026-10-25', '2026-10-25T00:30:00Z', 'ongoing'],
	['2026-10-25', '2026-10-25T01:30:00Z', 'ongoing'],
	['2026-10-25', '2026-10-25T03:00:00.001Z', 'passed']
])('uses Rome wall time across DST at %s %s', (date, instant, state) => {
	expect(
		displayStates(
			[{ ...timedEvent, date, startTime: '02:00', endTime: '04:00' }],
			new Date(instant)
		)
	).toEqual([state]);
});
