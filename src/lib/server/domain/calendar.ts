import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { assertUser } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { concreteDate, visibleWeekDays, digits, isPassed } from './dates.ts';
import { readWeekEvents } from './events.ts';
import { googleCalendarUrl } from './ics.ts';

const querySchema = z.object({ week: digits(5).pipe(z.number().int()).optional() });
export async function getCalendar(
	database: typeof db,
	actor: User | null,
	input: unknown,
	now: Date
) {
	assertUser(actor);
	const query = querySchema.parse(input);
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	const week = Math.min(Math.max(query.week ?? config.activeWeek, 1), config.activeWeek);
	const rows = await readWeekEvents(database, week);
	const visibleEvents = rows.map((event) => {
		const participants = event.participants;
		const date = concreteDate(event, config.poolStart);
		const registered = participants.some(
			(participant) => participant.participantLogin === actor.login
		);
		const state = isPassed(date, event.endTime, now)
			? 'passed'
			: registered
				? 'registered'
				: participants.length >= event.maxSlots
					? 'full'
					: 'available';
		return {
			id: event.id,
			title: event.title,
			description: event.description,
			kind: event.kind,
			weekday: event.weekday,
			startTime: event.startTime.slice(0, 5),
			endTime: event.endTime.slice(0, 5),
			compensation: event.compensation,
			maxSlots: event.maxSlots,
			registeredCount: participants.length,
			state,
			isRegistered: registered,
			date,
			googleUrl: googleCalendarUrl(event, date),
			participants: participants
				.filter((participant) => actor.role === 'admin' || participant.attended)
				.map(({ participantLogin, attended }) => ({ participantLogin, attended }))
		};
	});
	return {
		week,
		activeWeek: config.activeWeek,
		maxEventsPerUser: config.maxEventsPerUser,
		days: visibleWeekDays(visibleEvents, config.poolStart, week),
		events: visibleEvents
	};
}
