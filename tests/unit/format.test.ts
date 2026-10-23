import { expect, it } from 'vitest';
import { formatNumber } from '../../src/lib/format.ts';
import { weekdays } from '../../src/lib/weekdays.ts';
import { formatWeekDates } from '../../src/lib/server/domain/dates.ts';
it('formats numbers and weekday labels in the current locale', () => {
	expect(formatNumber(12345.5)).toBe('12.345,5');
	expect(weekdays.map((day) => day())).toEqual([
		'Lunedì',
		'Martedì',
		'Mercoledì',
		'Giovedì',
		'Venerdì',
		'Sabato',
		'Domenica'
	]);
});
it('formats both date collections while retaining fields and preserving the input', () => {
	const data = {
		days: [
			{ weekday: 1, date: '2027-01-04' },
			{ weekday: 2, date: null }
		],
		events: [{ id: 1, date: '2027-01-05', title: 'Example' }]
	};
	expect(formatWeekDates(data, 'it')).toEqual({
		days: [
			{ weekday: 1, date: '4 Gen', isoDate: '2027-01-04' },
			{ weekday: 2, date: '', isoDate: null }
		],
		events: [{ id: 1, date: '5 Gen', title: 'Example' }]
	});
	expect(data.days[0].date).toBe('2027-01-04');
});
