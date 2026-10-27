import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, settings } from '../db/schema.ts';
import type { User } from '../auth/session.ts';
import { matchesDisplayToken } from '../auth/guards.ts';
import { concreteDate, isPassed, romeDateTime, visibleWeekDays } from './dates.ts';
import { readWeekEvents } from './events.ts';
import { m } from '#lib/paraglide/messages.js';

type DisplaySettings = Pick<typeof settings.$inferSelect, 'poolStart' | 'displayWeek'>;
type DisplayEvent = Pick<typeof events.$inferSelect, 'week' | 'weekday' | 'eventDate' | 'endTime'>;
export function nextDisplayWeek(config: DisplaySettings, candidates: DisplayEvent[], now: Date) {
	const current = config.displayWeek;
	if (config.poolStart === null || current === 4) return current;
	const weekEvents = candidates.filter((event) => event.week === current);
	if (!weekEvents.length) return current + 1;
	const ended = weekEvents.every((event) => {
		const date = concreteDate(event, config.poolStart);
		return date === null || isPassed(date, event.endTime, now);
	});
	return ended && candidates.some((event) => event.week === current + 1) ? current + 1 : current;
}
export async function advanceDisplayWeek(database: typeof db, now: Date) {
	return database.transaction(async (tx) => {
		const [config] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (!config) throw new Error('Settings row is missing');
		const candidates = await tx
			.select({
				week: events.week,
				weekday: events.weekday,
				eventDate: events.eventDate,
				endTime: events.endTime
			})
			.from(events)
			.where(inArray(events.week, [config.displayWeek, config.displayWeek + 1]));
		const week = nextDisplayWeek(config, candidates, now);
		if (week === config.displayWeek) return config;
		const [updated] = await tx
			.update(settings)
			.set({ displayWeek: week, updatedAt: now })
			.where(eq(settings.id, 1))
			.returning();
		return updated;
	});
}
export function displayStates(
	candidates: {
		id: number;
		date: string | null;
		startTime: string;
		endTime: string;
		freeSlots: number;
	}[],
	now: Date
) {
	const localNow = romeDateTime(now);
	const started = (event: (typeof candidates)[number]) =>
		event.date !== null &&
		localNow >=
			`${event.date}T${event.startTime.length === 5 ? `${event.startTime}:00` : event.startTime}.000`;
	const next = candidates
		.filter((event) => event.date !== null && !started(event))
		.toSorted(
			(a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || a.id - b.id
		)[0];
	return candidates.map((event) =>
		isPassed(event.date, event.endTime, now)
			? 'passed'
			: started(event)
				? 'ongoing'
				: event.id === next?.id
					? 'next'
					: event.freeSlots > 0
						? 'available'
						: 'full'
	);
}
export async function getDisplay(
	database: typeof db,
	actor: User | null,
	input: unknown,
	expectedToken: string,
	now: Date
) {
	const query = z.object({ token: z.string().optional() }).safeParse(input);
	if (
		actor?.role !== 'admin' &&
		(!query.success || !matchesDisplayToken(query.data.token ?? null, expectedToken))
	)
		error(404, m.error_not_found());
	const config = await advanceDisplayWeek(database, now);
	const rows = await readWeekEvents(database, config.displayWeek);
	const visible = rows.map((event) => {
		const date = concreteDate(event, config.poolStart);
		const freeSlots = event.maxSlots - event.participants.length;
		return {
			id: event.id,
			title: event.title,
			kind: event.kind,
			weekday: event.weekday,
			date,
			startTime: event.startTime.slice(0, 5),
			endTime: event.endTime.slice(0, 5),
			compensation: event.compensation,
			freeSlots,
			maxSlots: event.maxSlots,
			participants: event.participants
				.filter((participant) => participant.attended)
				.map((participant) => participant.participantLogin)
		};
	});
	const states = displayStates(visible, now);
	return {
		week: config.displayWeek,
		days: visibleWeekDays(visible, config.poolStart, config.displayWeek),
		events: visible.map((event, index) => ({ ...event, state: states[index] }))
	};
}
