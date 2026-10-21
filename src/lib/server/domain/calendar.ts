import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, registrations, settings } from '../db/schema.ts';
import { assertUser } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { concreteDate, computeWeekDayDates, digits, isPassed } from './dates.ts';
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
	const rows = await database
		.select({ event: events, participant: registrations })
		.from(events)
		.leftJoin(registrations, eq(registrations.eventId, events.id))
		.where(eq(events.week, week))
		.orderBy(events.weekday, events.startTime, events.id, registrations.participantLogin);
	const grouped = new Map<
		number,
		{ event: typeof events.$inferSelect; participants: (typeof registrations.$inferSelect)[] }
	>();
	for (const { event, participant } of rows) {
		if (!grouped.has(event.id)) grouped.set(event.id, { event, participants: [] });
		if (participant) grouped.get(event.id)!.participants.push(participant);
	}
	const visibleEvents = [...grouped.values()].map(({ event, participants }) => {
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
			date,
			googleUrl: googleCalendarUrl(event, date),
			participants: participants
				.filter((participant) => actor.role === 'admin' || participant.attended)
				.map(({ participantLogin, attended }) => ({ participantLogin, attended }))
		};
	});
	const dayDates = computeWeekDayDates(config.poolStart, week);
	const days = [
		1,
		2,
		3,
		4,
		5,
		...[6, 7].filter((day) => visibleEvents.some((event) => event.weekday === day))
	].map((weekday) => ({ weekday, date: dayDates[weekday - 1] }));
	return { week, activeWeek: config.activeWeek, days, events: visibleEvents };
}
