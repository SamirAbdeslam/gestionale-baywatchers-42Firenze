import { error } from '@sveltejs/kit';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Transaction } from '../db/index.ts';
import { events, registrations } from '../db/schema.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { concreteDate, digits, isoDate, weekNumber, weekdayNumber } from './dates.ts';
import { capitalizeFirst, EVENT_KINDS, PRESETS } from './kinds.ts';
import { m } from '#lib/paraglide/messages.js';

const integer = digits(10).pipe(z.number().int().max(2147483647));
const week = digits(5).pipe(weekNumber);
const weekday = digits(5).pipe(weekdayNumber);
const id = integer.pipe(z.number().min(1));
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const text = z.string().trim().min(1).max(120).transform(capitalizeFirst);
const description = z.string().trim().max(500).transform(capitalizeFirst);
const editable = {
	title: text,
	description: description.default(''),
	weekday,
	startTime: time,
	endTime: time,
	maxSlots: integer.pipe(z.number().min(1)),
	compensation: integer.pipe(z.number().min(0))
};
const timeOrder = (value: { startTime: string; endTime: string }) =>
	value.startTime < value.endTime;
const datedWeekday = z
	.object({ weekday: weekdayNumber, eventDate: isoDate.nullable() })
	.refine(
		({ weekday, eventDate }) =>
			eventDate === null || (new Date(`${eventDate}T00:00:00Z`).getUTCDay() || 7) === weekday,
		{ message: 'error_event_date_weekday' }
	);
const createFields = {
	...editable,
	week,
	eventDate: z
		.union([isoDate, z.literal('')])
		.nullish()
		.transform((value) => value || null)
};
const createSchema = z
	.discriminatedUnion('kind', [
		z.strictObject({ ...createFields, kind: z.literal('custom') }),
		z.strictObject({
			...createFields,
			kind: z.enum(EVENT_KINDS).exclude(['custom']),
			title: z.string().trim().max(120).optional(),
			description: description.optional(),
			compensation: editable.compensation.optional()
		})
	])
	.refine(timeOrder)
	.superRefine((value, context) => {
		const result = datedWeekday.safeParse(value);
		if (!result.success)
			context.addIssue({ code: 'custom', message: 'error_event_date_weekday', path: ['weekday'] });
	});
const updateSchema = z.strictObject({ id, ...editable }).refine(timeOrder);
const deleteSchema = z.strictObject({ id });
const bulkSchema = z.strictObject({ week, weekday, confirm: z.literal('yes') });

// Page-specific loaders authorize access before reading participants.
export async function readWeekEvents(database: typeof db, input: number) {
	const rows = await database
		.select({ event: events, participant: registrations })
		.from(events)
		.leftJoin(registrations, eq(registrations.eventId, events.id))
		.where(eq(events.week, weekNumber.parse(input)))
		.orderBy(events.weekday, events.startTime, events.id, registrations.participantLogin);
	const grouped = new Map<
		number,
		typeof events.$inferSelect & { participants: (typeof registrations.$inferSelect)[] }
	>();
	for (const row of rows) {
		let event = grouped.get(row.event.id);
		if (!event) {
			event = { ...row.event, participants: [] };
			grouped.set(event.id, event);
		}
		if (row.participant) event.participants.push(row.participant);
	}
	return [...grouped.values()];
}

export async function listWeekEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	poolStart: string | null
) {
	assertAdmin(actor);
	const rows = await readWeekEvents(database, week.parse(input));
	return rows.map((event) => ({
		...event,
		concreteDate: concreteDate(event, poolStart),
		registeredCount: event.participants.length,
		attendedCount: event.participants.filter((participant) => participant.attended).length
	}));
}

export async function createEvent(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const parsed = createSchema.parse(input);
	const details =
		parsed.kind === 'custom'
			? {
					title: parsed.title,
					description: parsed.description || 'Evento personalizzato',
					compensation: parsed.compensation
				}
			: PRESETS[parsed.kind];
	const { event, logId } = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const user = await lockAdmin(tx, actor);
		const [event] = await tx
			.insert(events)
			.values({
				...parsed,
				...details,
				createdAt: now,
				updatedAt: now
			})
			.returning();
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'CREATE_EVENT',
			description: `Creato evento '${event.title}' (${event.weekday}, ${parsed.startTime}-${parsed.endTime}) per la settimana ${event.week}.`,
			resourceType: 'event',
			resourceId: String(event.id),
			newValue: event
		});
		return { event, logId };
	});
	publish({ type: 'log_created', id: logId });
	publish({ type: 'event_changed', eventId: event.id, week: event.week, action: 'create' });
	return event;
}

export async function updateEvent(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { id, ...changes } = updateSchema.parse(input);
	const { event, logId } = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const user = await lockAdmin(tx, actor);
		const [before] = await tx.select().from(events).where(eq(events.id, id)).for('update');
		if (!before) error(404, m.error_event_not_found());
		datedWeekday.parse({ weekday: changes.weekday, eventDate: before.eventDate });
		const [event] = await tx
			.update(events)
			.set({ ...changes, updatedAt: now })
			.where(eq(events.id, id))
			.returning();
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'UPDATE_EVENT',
			description: `Aggiornato evento '${event.title}' (ID: ${id}).`,
			resourceType: 'event',
			resourceId: String(id),
			oldValue: before,
			newValue: event
		});
		return { event, logId };
	});
	publish({ type: 'log_created', id: logId });
	publish({ type: 'event_changed', eventId: event.id, week: event.week, action: 'update' });
	return event;
}

async function deletionSnapshot(tx: Transaction, where: SQL | undefined) {
	// Lock events before reading participants so registration changes cannot escape the snapshot.
	const removed = await tx.select().from(events).where(where).orderBy(events.id).for('update');
	if (!removed.length) return [];
	const participants = await tx
		.select()
		.from(registrations)
		.where(
			inArray(
				registrations.eventId,
				removed.map((event) => event.id)
			)
		)
		.orderBy(registrations.participantLogin);
	return removed.map((event) => ({
		...event,
		participants: participants.filter((row) => row.eventId === event.id)
	}));
}

export async function deleteEvent(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const { id } = deleteSchema.parse(input);
	const { event, logId } = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const user = await lockAdmin(tx, actor);
		const oldValue = await deletionSnapshot(tx, eq(events.id, id));
		const [event] = oldValue;
		if (!event) error(404, m.error_event_not_found());
		await tx.delete(events).where(eq(events.id, id));
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'DELETE_EVENT',
			description: `Eliminato evento '${event.title}' (ID: ${id}) dalla settimana ${event.week}.`,
			resourceType: 'event',
			resourceId: String(id),
			oldValue
		});
		return { event, logId };
	});
	publish({ type: 'log_created', id: logId });
	publish({ type: 'event_changed', eventId: event.id, week: event.week, action: 'delete' });
}

async function deleteMatching(
	database: typeof db,
	actor: User,
	scope: { week?: number; weekday?: number },
	info: RequestInfo,
	entry: {
		actionType: 'DELETE_DAY_EVENTS' | 'DELETE_WEEK_EVENTS' | 'DELETE_ALL_EVENTS';
		description: string;
		resourceId?: string;
	}
) {
	const logId = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const user = await lockAdmin(tx, actor);
		const where = and(
			scope.week === undefined ? undefined : eq(events.week, scope.week),
			scope.weekday === undefined ? undefined : eq(events.weekday, scope.weekday)
		);
		const oldValue = await deletionSnapshot(tx, where);
		if (oldValue.length)
			await tx.delete(events).where(
				inArray(
					events.id,
					oldValue.map((event) => event.id)
				)
			);
		return audit(tx, {
			...info,
			actor: user,
			...entry,
			resourceType: 'event',
			oldValue
		});
	});
	publish({ type: 'log_created', id: logId });
	publish({
		type: 'event_changed',
		eventId: null,
		week: scope.week ?? null,
		action: 'bulk_delete'
	});
}
export async function deleteDayEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const { week, weekday } = bulkSchema.parse(input);
	await deleteMatching(database, actor, { week, weekday }, info, {
		actionType: 'DELETE_DAY_EVENTS',
		resourceId: `${week}-${weekday}`,
		description: `Eliminati tutti gli eventi del giorno '${weekday}' della settimana ${week}.`
	});
}
export async function deleteWeekEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const { week } = bulkSchema.omit({ weekday: true }).parse(input);
	await deleteMatching(database, actor, { week }, info, {
		actionType: 'DELETE_WEEK_EVENTS',
		resourceId: String(week),
		description: `Eliminati tutti gli eventi della settimana ${week}.`
	});
}
export async function deleteAllEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	bulkSchema.pick({ confirm: true }).parse(input);
	await deleteMatching(database, actor, {}, info, {
		actionType: 'DELETE_ALL_EVENTS',
		description: 'Eliminati TUTTI gli eventi da TUTTE le settimane.'
	});
}
