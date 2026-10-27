import { error } from '@sveltejs/kit';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Transaction, Database } from '../db/index.ts';
import { users, events, registrations, settings, whitelist } from '../db/schema.ts';
import { assertAdmin, assertUser, lockAdmin, loginPattern } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { concreteDate, digits, isPassed, romeDateTime } from './dates.ts';
import { publish } from '../realtime/bus.ts';
import { m } from '#lib/paraglide/messages.js';

type ErrorKey =
	| 'error_pool_not_started'
	| 'error_event_not_found'
	| 'error_registration_not_found'
	| 'error_not_whitelisted'
	| 'error_event_passed'
	| 'error_weekly_limit'
	| 'error_already_registered'
	| 'error_event_full'
	| 'error_event_passed_unregister';
type LoginKey =
	| 'registration_added'
	| 'registration_removed'
	| 'registration_already_registered_login'
	| 'registration_not_registered_login'
	| 'registration_present'
	| 'registration_absent';
export type RegistrationNotice =
	| {
			type: 'success' | 'error';
			key: ErrorKey | 'registration_registered' | 'registration_unregistered';
			params: { count?: number };
	  }
	| { type: 'success' | 'warning'; key: LoginKey; params: { login: string } };
export type RegistrationResult = {
	registeredEventId?: number;
	ok: boolean;
	messages: RegistrationNotice[];
	status?: 400 | 403 | 404;
};
const idSchema = z.strictObject({
	id: digits(10).pipe(z.number().int().positive().max(2147483647))
});
const participantSchema = idSchema.extend({
	login: z.string().trim().toLowerCase().regex(loginPattern)
});
const attendanceSchema = participantSchema.extend({
	attended: z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
});
const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const failure = (
	key: ErrorKey,
	status: 400 | 403 | 404 = 400,
	params: { count?: number } = {}
): RegistrationResult => ({ ok: false, status, messages: [{ type: 'error', key, params }] });
type Operation = 'register' | 'unregister' | 'add' | 'remove' | 'attendance';

export async function countWeeklyRegistrations(database: Database, login: string, week: number) {
	const [total] = await database
		.select({ n: count() })
		.from(registrations)
		.innerJoin(events, eq(registrations.eventId, events.id))
		.where(and(eq(registrations.participantLogin, login), eq(events.week, week)));
	return total.n;
}

async function passed(tx: Transaction, event: typeof events.$inferSelect, now: Date) {
	const [config] = await tx.select().from(settings).where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	return { config, isPassed: isPassed(concreteDate(event, config.poolStart), event.endTime, now) };
}

async function changeRegistration(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date,
	operation: Operation
): Promise<RegistrationResult> {
	const admin = operation === 'add' || operation === 'remove' || operation === 'attendance';
	if (admin) assertAdmin(actor);
	else assertUser(actor);
	const parsed: { id: number; login?: string; attended?: boolean } =
		operation === 'attendance'
			? attendanceSchema.parse(input)
			: admin
				? participantSchema.parse(input)
				: idSchema.parse(input);
	const outcome = await database.transaction(
		async (
			tx
		): Promise<
			| RegistrationResult
			| { result: RegistrationResult; event: typeof events.$inferSelect; logId: number }
		> => {
			// All registration mutations lock the acting user before the event.
			const [user] = admin
				? [await lockAdmin(tx, actor)]
				: await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
			if (!user) error(401, m.error_unauthorized());
			const [event] = await tx.select().from(events).where(eq(events.id, parsed.id)).for('update');
			if (!event) return failure('error_event_not_found', 404);
			const login = parsed.login ?? user.login;
			const participant = and(
				eq(registrations.eventId, event.id),
				eq(registrations.participantLogin, login)
			);
			let result: RegistrationResult;
			let actionType:
				| 'REGISTER_EVENT'
				| 'UNREGISTER_EVENT'
				| 'ADMIN_ADD_PARTICIPANT'
				| 'ADMIN_UNREGISTER'
				| 'MARK_PRESENT'
				| 'MARK_ABSENT';
			let description: string;
			const details = `'${event.title}' (${days[event.weekday - 1]}, ${event.startTime.slice(0, 5)}-${event.endTime.slice(0, 5)}, ID: ${event.id}).`;
			if (operation === 'register') {
				const [allowed] = await tx
					.select({ id: whitelist.id })
					.from(whitelist)
					.where(eq(whitelist.login, login));
				if (!allowed) return failure('error_not_whitelisted', 403);
				const { config, isPassed: ended } = await passed(tx, event, now);
				if (config.poolStart && romeDateTime(now).slice(0, 10) < config.poolStart)
					return failure('error_pool_not_started');
				if (ended) return failure('error_event_passed');
				if (config.maxEventsPerUser > 0) {
					const total = await countWeeklyRegistrations(tx, login, event.week);
					if (total >= config.maxEventsPerUser)
						return failure('error_weekly_limit', 400, { count: config.maxEventsPerUser });
				}
				const [existing] = await tx
					.select({ id: registrations.id })
					.from(registrations)
					.where(participant);
				if (existing) return failure('error_already_registered');
				const [total] = await tx
					.select({ n: count() })
					.from(registrations)
					.where(eq(registrations.eventId, event.id));
				if (total.n >= event.maxSlots) return failure('error_event_full');
				actionType = 'REGISTER_EVENT';
				description = `Utente '${login}' registrato all'evento ${details}`;
				result = {
					ok: true,
					messages: [{ type: 'success', key: 'registration_registered', params: {} }],
					registeredEventId: event.id
				};
			} else if (operation === 'add') {
				const [existing] = await tx
					.select({ id: registrations.id })
					.from(registrations)
					.where(participant);
				if (existing)
					return {
						ok: false,
						messages: [
							{
								type: 'warning' as const,
								key: 'registration_already_registered_login' as const,
								params: { login }
							}
						]
					};
				actionType = 'ADMIN_ADD_PARTICIPANT';
				description = `Admin ha aggiunto '${login}' all'evento ${details}`;
				result = {
					ok: true,
					messages: [{ type: 'success', key: 'registration_added', params: { login } }]
				};
			} else if (operation === 'attendance') {
				const attended = parsed.attended === true;
				const [row] = await tx
					.update(registrations)
					.set({ attended })
					.where(participant)
					.returning({ id: registrations.id });
				if (!row) return failure('error_registration_not_found', 404);
				actionType = attended ? 'MARK_PRESENT' : 'MARK_ABSENT';
				description = `Segnato '${login}' come ${attended ? 'presente' : 'assente'} per l'evento ${details}`;
				result = {
					ok: true,
					messages: [
						{
							type: attended ? 'success' : 'warning',
							key: attended ? 'registration_present' : 'registration_absent',
							params: { login }
						}
					]
				};
			} else {
				if (operation === 'unregister' && user.role !== 'admin') {
					if ((await passed(tx, event, now)).isPassed)
						return failure('error_event_passed_unregister');
				}
				const [removed] = await tx
					.delete(registrations)
					.where(participant)
					.returning({ id: registrations.id });
				if (!removed)
					return {
						ok: true,
						messages:
							operation === 'unregister'
								? []
								: [{ type: 'warning', key: 'registration_not_registered_login', params: { login } }]
					};
				actionType = operation === 'unregister' ? 'UNREGISTER_EVENT' : 'ADMIN_UNREGISTER';
				description =
					operation === 'unregister'
						? `Utente '${login}' disiscritto dall'evento ${details}`
						: `Admin ha disiscritto '${login}' dall'evento ${details}`;
				result =
					operation === 'unregister'
						? {
								ok: true,
								messages: [{ type: 'success', key: 'registration_unregistered', params: {} }]
							}
						: {
								ok: true,
								messages: [{ type: 'success', key: 'registration_removed', params: { login } }]
							};
			}
			if (operation === 'register' || operation === 'add')
				await tx.insert(registrations).values({
					eventId: event.id,
					participantLogin: login,
					attended: true,
					registeredAt: now
				});
			const logId = await audit(tx, {
				...info,
				actor: user,
				actionType,
				description,
				resourceType: 'event',
				resourceId: String(event.id)
			});
			return { result, event, logId };
		}
	);
	if ('result' in outcome) {
		publish({ type: 'log_created', id: outcome.logId });
		publish({
			type: 'event_changed',
			eventId: outcome.event.id,
			week: outcome.event.week,
			action: 'update'
		});
		return outcome.result;
	}
	return outcome;
}

const op =
	(operation: Operation) =>
	(database: typeof db, actor: User | null, input: unknown, info: RequestInfo, now: Date) =>
		changeRegistration(database, actor, input, info, now, operation);
export const register = op('register');
export const unregister = op('unregister');
export const addParticipant = op('add');
export const removeParticipant = op('remove');
export const setAttendance = op('attendance');
