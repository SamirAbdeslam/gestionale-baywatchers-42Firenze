import { expect, it } from 'vitest';
import { poolPhase, poolStats, type PoolEntry } from '../../src/lib/server/domain/pool.ts';

const config = { poolStart: '2026-10-19', poolEnd: '2026-11-15' };
const event = { eventDate: null, week: 1, weekday: 1 };
it.each([
	[null, null, '2026-10-19T10:00:00Z', 'none'],
	[null, '2026-11-15', '2026-10-19T10:00:00Z', 'none'],
	['2026-10-19', null, '2026-12-01T10:00:00Z', 'none'],
	['2026-10-19', '2026-11-15', '2026-10-18T21:59:59.999Z', 'upcoming'],
	['2026-10-19', '2026-11-15', '2026-10-18T22:00:00Z', 'open'],
	['2026-10-19', '2026-11-15', '2026-11-15T22:59:59.999Z', 'open'],
	['2026-10-19', '2026-11-15', '2026-11-15T23:00:00Z', 'closed']
] as const)('calculates phase for %s / %s at %s', (poolStart, poolEnd, now, phase) => {
	expect(poolPhase({ poolStart, poolEnd }, [event], new Date(now))).toBe(phase);
});
it('keeps a pool active for absolute or derived event dates beyond its end', () => {
	const now = new Date('2026-11-16T10:00:00Z');
	expect(poolPhase(config, [], now)).toBe('closed');
	expect(poolPhase(config, [{ ...event, eventDate: '2026-11-16' }], now)).toBe('open');
	expect(poolPhase({ ...config, poolEnd: '2026-10-20' }, [{ ...event, week: 4 }], now)).toBe(
		'open'
	);
	expect(poolPhase(config, [{ ...event, eventDate: config.poolEnd }], now)).toBe('closed');
});
it.each([
	'2026-03-29T00:59:59Z',
	'2026-03-29T01:00:00Z',
	'2026-10-25T00:59:59Z',
	'2026-10-25T01:00:00Z'
])('uses Rome calendar dates across DST at %s', (instant) => {
	const day = instant.slice(0, 10);
	expect(poolPhase({ poolStart: day, poolEnd: day }, [], new Date(instant))).toBe('open');
});

it('manual closure wins before the start, and reopening suppresses automatic closure after the end', () => {
	const now = new Date('2026-12-01T12:00:00Z');
	expect(poolPhase({ ...config, poolClosedAt: now }, [], new Date('2026-10-01T12:00:00Z'))).toBe(
		'closed'
	);
	expect(poolPhase({ ...config, poolReopened: true }, [], now)).toBe('open');
	expect(poolPhase({ ...config, poolClosedAt: now, poolReopened: true }, [], now)).toBe('closed');
	expect(poolPhase({ ...config, poolEnd: null, poolClosedAt: now }, [], now)).toBe('none');
});

const entry = (changes: Partial<PoolEntry> = {}): PoolEntry => ({
	login: 'alpha',
	title: 'Exam',
	kind: 'exam',
	eventDate: '2026-10-19',
	weekday: 1,
	startTime: '09:00:00',
	endTime: '10:00:00',
	durationMinutes: 60,
	compensation: 200,
	attended: true,
	registeredAt: new Date('2026-10-01T10:00:00Z'),
	week: null,
	maxSlots: null,
	eventRef: null,
	weekActivatedAt: null,
	...changes
});
it('returns finite zero totals and absent descriptive values for no entries or unknown login', () => {
	const empty = poolStats([]);
	expect(empty).toMatchObject({
		taken: 0,
		completed: 0,
		minutes: 0,
		hours: 0,
		altarian: 0,
		participants: 0,
		attendancePercent: 0,
		contributionPercent: 0,
		favoriteWeekday: null,
		favoriteTimeBand: null,
		busiestWeek: null,
		firstShift: null,
		lastShift: null,
		badges: []
	});
	expect(empty.byKind.every((kind) => kind.count === 0 && kind.percent === 0)).toBe(true);
	expect(poolStats([entry()], 'missing')).toMatchObject({
		taken: 0,
		hours: 0,
		contributionPercent: 0,
		totals: { taken: 1, completed: 1, hours: 1 }
	});
});
it('counts absences as taken and participants but gives no hours, money or badges', () => {
	expect(
		poolStats([entry({ attended: false }), entry({ login: 'beta', attended: false })], 'alpha')
	).toMatchObject({
		taken: 1,
		completed: 0,
		hours: 0,
		altarian: 0,
		attendancePercent: 0,
		favoriteWeekday: null,
		favoriteTimeBand: null,
		busiestWeek: null,
		firstShift: null,
		contributionPercent: 0,
		badges: [],
		totals: { taken: 2, participants: 2, hours: 0 }
	});
});
it('shares pool totals, filters login exactly, sums minutes before rounding and excludes absences', () => {
	const entries = [
		entry({ durationMinutes: 20 }),
		entry({ durationMinutes: 20 }),
		entry({ durationMinutes: 20 }),
		entry({ login: 'beta', durationMinutes: 180 }),
		entry({ attended: false, durationMinutes: 500, compensation: 9000 })
	];
	const stats = poolStats(entries, 'alpha');
	expect(stats).toMatchObject({
		taken: 4,
		completed: 3,
		minutes: 60,
		hours: 1,
		altarian: 600,
		attendancePercent: 75,
		contributionPercent: 25,
		totals: {
			taken: 5,
			completed: 4,
			minutes: 240,
			hours: 4,
			altarian: 800,
			participants: 2,
			attendancePercent: 80
		}
	});
	expect(stats.totals).toEqual(poolStats(entries).totals);
	expect(stats.byKind.find((kind) => kind.kind === 'exam')).toEqual({
		kind: 'exam',
		count: 3,
		percent: 100
	});
	expect(poolStats([entry({ durationMinutes: 20 })]).hours).toBe(0.33);
});
it('handles imported rows without times, weekday, date or registration date without inventing them', () => {
	const partial = entry({
		startTime: null,
		endTime: null,
		weekday: null,
		eventDate: null,
		registeredAt: null,
		durationMinutes: 90
	});
	expect(poolStats([partial])).toMatchObject({
		hours: 1.5,
		altarian: 200,
		favoriteWeekday: null,
		favoriteTimeBand: null,
		busiestWeek: null,
		firstShift: null,
		lastShift: null,
		badges: []
	});
	expect(poolStats([partial, entry()])).toMatchObject({
		favoriteWeekday: 1,
		favoriteTimeBand: 'morning',
		badges: []
	});
});
it.each([
	['11:59', 'morning'],
	['12:00', 'afternoon'],
	['17:59', 'afternoon'],
	['18:00', 'evening']
] as const)('classifies the %s boundary as %s', (startTime, band) => {
	expect(poolStats([entry({ startTime })]).favoriteTimeBand).toBe(band);
});
it('finds attended first/last shifts and stable descriptors with stable ties independent of input order', () => {
	const first = entry({ eventDate: '2026-09-30', startTime: '08:00', weekday: 3 });
	const last = entry({ eventDate: '2026-10-30', startTime: '18:00', weekday: 5 });
	const rows = [last, entry({ attended: false, eventDate: '2026-12-01' }), first];
	const stats = poolStats(rows);
	expect(stats).toMatchObject({
		firstShift: first,
		lastShift: last,
		busiestWeek: null,
		favoriteWeekday: 3,
		favoriteTimeBand: 'morning'
	});
	expect(stats).toEqual(poolStats([...rows].reverse()));
});
it('awards descriptive badges only when their attendance and strict majority thresholds hold', () => {
	const rows = [entry(), entry({ kind: 'rush' }), entry({ kind: 'cluster', startTime: '18:00' })];
	expect(poolStats(rows).badges).toEqual(['early_bird', 'all_rounder', 'always_there']);
	expect(poolStats(rows.slice(0, 2)).badges).toEqual(['early_bird']);
	expect(poolStats([entry(), entry({ startTime: '12:00' })]).badges).toEqual([]);
	expect(poolStats([...rows, entry({ attended: false })]).badges).toEqual([
		'early_bird',
		'all_rounder'
	]);
	expect(
		poolStats([entry(), entry({ kind: 'rush' }), entry({ kind: 'cluster', attended: false })])
			.badges
	).toEqual(['early_bird']);
});

it('counts exact seven-day weeks from pool start across months and DST, with stable ties', () => {
	const rows = [
		entry({ eventDate: '2026-10-25' }),
		entry({ eventDate: '2026-10-26' }),
		entry({ eventDate: '2026-11-01' }),
		entry({ eventDate: '2026-11-02' }),
		entry({ eventDate: '2026-11-09' }),
		entry({ eventDate: '2026-11-15' }),
		entry({ eventDate: '2026-11-16' }),
		entry({ eventDate: '2026-10-18' }),
		entry({ eventDate: '2026-10-19', attended: false })
	];
	const stats = poolStats(rows, 'alpha', '2026-10-19');
	expect(stats.weekCounts).toEqual([
		{ week: 1, count: 1 },
		{ week: 2, count: 2 },
		{ week: 3, count: 1 },
		{ week: 4, count: 2 }
	]);
	expect(stats.busiestWeek).toBe(2);
	expect(poolStats([...rows].reverse(), 'alpha', '2026-10-19')).toEqual(stats);
	expect(poolStats([entry({ eventDate: '2026-03-30' })], 'alpha', '2026-03-24').busiestWeek).toBe(
		1
	);
	expect(poolStats([entry({ eventDate: '2026-03-31' })], 'alpha', '2026-03-24').busiestWeek).toBe(
		2
	);
});
it('omits weekly statistics without an exact start or complete attended dates', () => {
	expect(poolStats([entry()], 'alpha').weekCounts).toBeNull();
	expect(
		poolStats([entry(), entry({ eventDate: null })], 'alpha', '2026-10-19').weekCounts
	).toBeNull();
	expect(poolStats([], 'alpha', '2026-10-19').busiestWeek).toBeNull();
	expect(
		poolStats([entry({ eventDate: '2026-12-01' })], 'alpha', '2026-10-19').busiestWeek
	).toBeNull();
	expect(
		poolStats([entry(), entry({ eventDate: null, attended: false })], 'alpha', '2026-10-19')
			.busiestWeek
	).toBe(1);
});

it('uses the stored week for the busiest week when every attended entry has one', () => {
	const rows = [
		entry({ week: 3, eventDate: '2026-10-19' }),
		entry({ week: 3, eventDate: '2026-10-20' }),
		entry({ week: 2, eventDate: '2026-10-21' })
	];
	// Dates alone would point to week 1; the stored week wins and does not need a pool start.
	expect(poolStats(rows, 'alpha').busiestWeek).toBe(3);
	expect(poolStats(rows, 'alpha', '2026-10-19').weekCounts?.map((w) => w.count)).toEqual([
		0, 1, 2, 0
	]);
	// A mixed archive falls back to dates.
	expect(poolStats([...rows, entry({ week: null })], 'alpha', '2026-10-19').busiestWeek).toBe(1);
});
