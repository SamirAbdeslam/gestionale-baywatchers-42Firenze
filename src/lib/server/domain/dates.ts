import { z } from 'zod';

export const digits = (maxLength: number) =>
	z.union([z.number(), z.string().regex(new RegExp(`^\\d{1,${maxLength}}$`))]).transform(Number);

export const isoDate = z.iso.date();
export const weekNumber = z.number().int().min(1).max(4);
export const weekdayNumber = z.number().int().min(1).max(7);

export function addDays(date: string, days: number): string {
	isoDate.parse(date);
	const value = new Date(`${date}T00:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

export function concreteDate(
	event: { eventDate: string | null; week: number; weekday: number },
	poolStart: string | null
): string | null {
	if (event.eventDate !== null) return isoDate.parse(event.eventDate);
	if (poolStart === null) return null;
	return addDays(
		poolStart,
		7 * (weekNumber.parse(event.week) - 1) + weekdayNumber.parse(event.weekday) - 1
	);
}

export function computeWeekDayDates(poolStart: string | null, week: number): (string | null)[] {
	return Array.from({ length: 7 }, (_, day) =>
		concreteDate({ eventDate: null, week, weekday: day + 1 }, poolStart)
	);
}

export function setPoolDates(start: string, end?: string) {
	const poolStart = isoDate.parse(start);
	const poolEnd = end ? isoDate.parse(end) : addDays(poolStart, 27);
	if (poolEnd < poolStart) throw new Error('Pool end must not precede start');
	return { poolStart, poolEnd };
}

const romeClock = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Rome',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	fractionalSecondDigits: 3,
	hourCycle: 'h23'
});

export function isPassed(date: string | null, endTime: string, now: Date): boolean {
	if (date === null) return false;
	isoDate.parse(date);
	const p = Object.fromEntries(
		romeClock.formatToParts(now).map(({ type, value }) => [type, value])
	);
	const localNow = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}`;
	const end = endTime.length === 5 ? `${endTime}:00` : endTime;
	z.iso.time().parse(end);
	return localNow > `${date}T${end}.000`;
}

export function formatEventDate(date: string | null, locale: string): string {
	if (date === null) return '';
	isoDate.parse(date);
	return new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/Rome'
	})
		.formatToParts(new Date(`${date}T12:00:00Z`))
		.map((part) =>
			part.type === 'month' && locale.startsWith('it')
				? part.value[0].toUpperCase() + part.value.slice(1)
				: part.value
		)
		.join('');
}

export function visibleWeekDays(
	events: { weekday: number }[],
	poolStart: string | null,
	week: number
) {
	const dates = computeWeekDayDates(poolStart, week);
	return [
		1,
		2,
		3,
		4,
		5,
		...[6, 7].filter((day) => events.some((event) => event.weekday === day))
	].map((weekday) => ({ weekday, date: dates[weekday - 1] }));
}

export function formatWeekDates<
	D extends { date: string | null },
	E extends { date: string | null }
>(data: { days: D[]; events: E[] }, locale: string) {
	return {
		days: data.days.map((day) => ({ ...day, date: formatEventDate(day.date, locale) })),
		events: data.events.map((event) => ({ ...event, date: formatEventDate(event.date, locale) }))
	};
}
