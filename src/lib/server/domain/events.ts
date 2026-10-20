import { error } from '@sveltejs/kit';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Transaction } from '../db/index.ts';
import { events, registrations, users } from '../db/schema.ts';
import { assertAdmin } from '../auth/guards.ts';
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
const createSchema = z
	.strictObject({
		...editable,
		title: z.string().trim().max(120).optional(),
		description: description.optional(),
		compensation: editable.compensation.optional(),
		week,
		kind: z.enum(EVENT_KINDS),
		eventDate: z
			.union([isoDate, z.literal('')])
			.nullish()
			.transform((value) => value || null)
	})
	.refine(timeOrder)
	.superRefine((value, context) => {
		if (value.kind === 'custom' && (!value.title || value.compensation === undefined))
			context.addIssue({ code: 'custom', message: 'Custom events require title and compensation' });
	});
const updateSchema = z.strictObject({ id, ...editable }).refine(timeOrder);
const deleteSchema = z.strictObject({ id });
const bulkSchema = z.strictObject({ week, weekday, confirm: z.literal('yes') });

export async function listWeekEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	poolStart: string | null
) {
	assertAdmin(actor);
	const rows = await database
		.select({ event: events, participant: registrations })
		.from(events)
		.leftJoin(registrations, eq(registrations.eventId, events.id))
		.where(eq(events.week, week.parse(input)))
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
	return [...grouped.values()].map((event) => ({
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
					title: text.parse(parsed.title),
					description: parsed.description || 'Evento personalizzato',
					compensation: parsed.compensation!
				}
			: PRESETS[parsed.kind];
	const { event, logId } = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
		if (!user) error(401, m.error_unauthorized());
		assertAdmin(user);
		const [event] = await tx
			.insert(events)
			.values({
				...parsed,
				...details,
				title: capitalizeFirst(details.title),
				description: capitalizeFirst(details.description),
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
		const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
		if (!user) error(401, m.error_unauthorized());
		assertAdmin(user);
		const [before] = await tx.select().from(events).where(eq(events.id, id)).for('update');
		if (!before) error(404, m.error_event_not_found());
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
		const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
		if (!user) error(401, m.error_unauthorized());
		assertAdmin(user);
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
	info: RequestInfo
) {
	const actionType =
		scope.weekday !== undefined
			? 'DELETE_DAY_EVENTS'
			: scope.week !== undefined
				? 'DELETE_WEEK_EVENTS'
				: 'DELETE_ALL_EVENTS';
	const resourceId =
		scope.weekday !== undefined ? `${scope.week}-${scope.weekday}` : scope.week?.toString();
	const description =
		scope.weekday !== undefined
			? `Eliminati tutti gli eventi del giorno '${scope.weekday}' della settimana ${scope.week}.`
			: scope.week !== undefined
				? `Eliminati tutti gli eventi della settimana ${scope.week}.`
				: 'Eliminati TUTTI gli eventi da TUTTE le settimane.';
	const logId = await database.transaction(async (tx) => {
		// Match registration lock order before event writes and the audit's user FK.
		const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
		if (!user) error(401, m.error_unauthorized());
		assertAdmin(user);
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
			actionType,
			description,
			resourceType: 'event',
			resourceId,
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
	await deleteMatching(database, actor, { week, weekday }, info);
}
export async function deleteWeekEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const { week } = bulkSchema.omit({ weekday: true }).parse(input);
	await deleteMatching(database, actor, { week }, info);
}
export async function deleteAllEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	bulkSchema.pick({ confirm: true }).parse(input);
	await deleteMatching(database, actor, {}, info);
}
