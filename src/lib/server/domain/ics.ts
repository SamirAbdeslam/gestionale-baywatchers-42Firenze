import ical, { ICalAlarmType } from 'ical-generator';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, settings } from '../db/schema.ts';
import { assertUser } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { concreteDate, digits, isoDate } from './dates.ts';
import { m } from '#lib/paraglide/messages.js';

type CalendarEvent = Pick<
	typeof events.$inferSelect,
	'id' | 'title' | 'description' | 'startTime' | 'endTime'
>;
export function eventTimes(date: string, event: Pick<CalendarEvent, 'startTime' | 'endTime'>) {
	isoDate.parse(date);
	// The process timezone is required to be Europe/Rome at startup.
	return {
		start: new Date(`${date}T${event.startTime}`),
		end: new Date(`${date}T${event.endTime}`)
	};
}
export function googleCalendarUrl(event: CalendarEvent, date: string | null) {
	if (date === null) return null;
	const { start, end } = eventTimes(date, event);
	const compact = (value: Date) => value.toISOString().replace(/-|:|\.\d{3}/g, '');
	const url = new URL('https://www.google.com/calendar/render');
	url.search = new URLSearchParams({
		action: 'TEMPLATE',
		text: event.title,
		dates: `${compact(start)}/${compact(end)}`,
		details: event.description || `Evento Baywatcher: ${event.title}`,
		location: '42 Firenze',
		ctz: 'Europe/Rome'
	}).toString();
	return url.toString();
}
export function createIcs(event: CalendarEvent, date: string, now: Date) {
	const { start, end } = eventTimes(date, event);
	const calendar = ical({
		prodId: { company: 'GestionaleBaywatchers', product: '42Firenze', language: 'IT' }
	});
	calendar.createEvent({
		id: `event-${event.id}-${start.toISOString()}@baywatchers.42firenze.it`,
		start,
		end,
		timezone: 'Europe/Rome',
		stamp: now,
		summary: event.title,
		description: event.description,
		location: '42 Firenze',
		alarms: [1440, 120, 60].map((minutes) => ({
			type: ICalAlarmType.display,
			trigger: minutes * 60,
			description: `Ricorda: ${event.title}`
		}))
	});
	return calendar.toString();
}
export async function downloadIcs(
	database: typeof db,
	actor: User | null,
	input: unknown,
	now: Date
) {
	assertUser(actor);
	const id = digits(10).pipe(z.number().int().positive().max(2147483647)).parse(input);
	const [event] = await database.select().from(events).where(eq(events.id, id));
	if (!event) error(404, m.error_event_not_found());
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	const date = concreteDate(event, config.poolStart);
	if (!date) error(409, m.error_event_date_unset());
	return { id, content: createIcs(event, date, now) };
}
