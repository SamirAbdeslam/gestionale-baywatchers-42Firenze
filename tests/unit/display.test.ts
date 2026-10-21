import { expect, it } from 'vitest';
import { nextDisplayWeek } from '../../src/lib/server/domain/display.ts';
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
