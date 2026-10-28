import { m } from '#lib/paraglide/messages.js';
import { randomBytes } from 'node:crypto';
import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { renderSVG } from 'uqr';
import type { db } from '../db/index.ts';
import { settings, whitelist, enrollmentRequests, actionLogs, users } from '../db/schema.ts';
import { assertAdmin, assertUser, lockAdmin, loginPattern } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { insertWhitelistLogin } from './whitelist.ts';
import { publish } from '../realtime/bus.ts';

export type EnrollmentNotice = {
	type: 'success' | 'warning' | 'error';
	key:
		| 'enrollment_opened'
		| 'enrollment_closed'
		| 'enrollment_sent'
		| 'enrollment_already_in'
		| 'enrollment_waiting'
		| 'enrollment_reviewed'
		| 'pool_dates_required';
	params: Record<string, never>;
};
const notice = (key: EnrollmentNotice['key'], ok = true) => ({
	ok,
	messages: [{ type: ok ? 'success' : 'warning', key, params: {} }] satisfies EnrollmentNotice[]
});
const toggleSchema = z.strictObject({ open: z.enum(['yes', 'no']) });
const weeksSchema = z
	.array(z.coerce.number().int().min(1).max(4))
	.min(1)
	.max(4)
	.refine((weeks) => new Set(weeks).size === weeks.length);
const requestSchema = z.strictObject({ code: z.string().max(128), weeks: weeksSchema });
const reviewSchema = z.strictObject({
	logins: z.array(z.string().regex(loginPattern)).min(1).max(10000),
	decision: z.enum(['approve', 'reject'])
});

export async function setEnrollment(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { open } = toggleSchema.parse(input);
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [config] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (open === 'yes' && (!config.poolStart || !config.poolEnd)) return null;
		const enrollmentCode =
			open === 'yes' ? (config.enrollmentCode ?? randomBytes(24).toString('hex')) : null;
		if (enrollmentCode === config.enrollmentCode) return [];
		await tx.update(settings).set({ enrollmentCode, updatedAt: now }).where(eq(settings.id, 1));
		return [
			await audit(tx, {
				...info,
				actor: user,
				actionType: 'UPDATE_SETTING',
				description: open === 'yes' ? m.enrollment_opened() : m.enrollment_closed(),
				resourceType: 'settings',
				resourceId: 'enrollment',
				newValue: { open: open === 'yes' }
			})
		];
	});
	if (result === null) return notice('pool_dates_required', false);
	for (const id of result) publish({ type: 'log_created', id });
	return notice(open === 'yes' ? 'enrollment_opened' : 'enrollment_closed');
}

export async function getEnrollment(database: typeof db, code: string, actor: User | null) {
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	if (
		!config.poolStart ||
		!config.poolEnd ||
		!config.enrollmentCode ||
		config.enrollmentCode !== code
	)
		return { state: 'closed' as const, poolStart: null };
	if (actor) {
		const [approved] = await database
			.select()
			.from(whitelist)
			.where(eq(whitelist.login, actor.login));
		if (approved) return { state: 'approved' as const, poolStart: config.poolStart };
		const [waiting] = await database
			.select()
			.from(enrollmentRequests)
			.where(eq(enrollmentRequests.login, actor.login));
		if (waiting) return { state: 'waiting' as const, poolStart: config.poolStart };
	}
	return { state: 'ready' as const, poolStart: config.poolStart };
}

export async function requestEnrollment(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertUser(actor);
	const { code, weeks } = requestSchema.parse(input);
	const result = await database.transaction(async (tx) => {
		// Share the settings lock with opening, closing, review and cleanup.
		const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
		assertUser(user ?? null);
		const [config] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (
			!config.poolStart ||
			!config.poolEnd ||
			!config.enrollmentCode ||
			config.enrollmentCode !== code
		)
			return { key: 'enrollment_closed' as const };
		const [approved] = await tx.select().from(whitelist).where(eq(whitelist.login, user.login));
		if (approved) return { key: 'enrollment_already_in' as const };
		const sorted = [...weeks].sort();
		const [row] = await tx
			.insert(enrollmentRequests)
			.values({ login: user.login, weeks: sorted, createdAt: now })
			.onConflictDoNothing()
			.returning();
		if (!row) return { key: 'enrollment_waiting' as const };
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'WHITELIST_REQUEST',
			description: m.enrollment_request_log({ login: user.login }),
			resourceType: 'pool_enrollment',
			resourceId: config.poolStart,
			newValue: { login: user.login, weeks: sorted }
		});
		return { key: 'enrollment_sent' as const, logId };
	});
	if ('logId' in result && result.logId !== undefined) {
		publish({ type: 'log_created', id: result.logId });
	}
	return notice(result.key, result.key === 'enrollment_sent');
}

export async function reviewEnrollment(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { logins, decision } = reviewSchema.parse(input);
	const logIds = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		const rows = await tx
			.select()
			.from(enrollmentRequests)
			.where(inArray(enrollmentRequests.login, [...new Set(logins)]))
			.orderBy(enrollmentRequests.login)
			.for('update');
		const ids: number[] = [];
		for (const row of rows) {
			if (decision === 'approve') {
				const inserted = await insertWhitelistLogin(tx, user, row.login, row.weeks, info, now);
				if (inserted) ids.push(inserted.logId);
			} else
				ids.push(
					await audit(tx, {
						...info,
						actor: user,
						actionType: 'WHITELIST_REJECT',
						description: m.enrollment_reject_log({ login: row.login }),
						resourceType: 'enrollment_requests',
						resourceId: row.login,
						oldValue: row
					})
				);
			await tx.delete(enrollmentRequests).where(eq(enrollmentRequests.login, row.login));
		}
		return ids;
	});
	for (const id of logIds) publish({ type: 'log_created', id });
	return notice('enrollment_reviewed');
}

export function enrollmentWeeks(
	approved: { login: string; weeks: number[] | null }[],
	waiting: { login: string; weeks: number[] }[]
) {
	return [1, 2, 3, 4].map((week) => ({
		week,
		people: [
			...approved
				.filter((row) => row.weeks?.includes(week))
				.map((row) => ({ login: row.login, state: 'approved' as const })),
			...waiting
				.filter((row) => row.weeks.includes(week))
				.map((row) => ({ login: row.login, state: 'waiting' as const }))
		].sort((a, b) => a.login.localeCompare(b.login))
	}));
}

export async function enrollmentAdmin(database: typeof db, actor: User | null, origin: string) {
	assertAdmin(actor);
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	const waiting = await database
		.select()
		.from(enrollmentRequests)
		.orderBy(enrollmentRequests.createdAt, enrollmentRequests.login);
	const approved = await database.select().from(whitelist).orderBy(whitelist.login);
	const [received] = await database
		.select({ count: count() })
		.from(actionLogs)
		.where(
			and(
				eq(actionLogs.actionType, 'WHITELIST_REQUEST'),
				eq(actionLogs.resourceType, 'pool_enrollment'),
				eq(actionLogs.resourceId, config.poolStart ?? '')
			)
		);
	const url =
		config.poolStart && config.poolEnd && config.enrollmentCode
			? new URL(`/join/${config.enrollmentCode}`, origin).href
			: null;
	return {
		poolStart: config.poolStart,
		canOpen: Boolean(config.poolStart && config.poolEnd),
		url,
		qr: url
			? `data:image/svg+xml;base64,${Buffer.from(renderSVG(url, { border: 4 })).toString('base64')}`
			: null,
		received: received.count,
		waiting,
		weeks: enrollmentWeeks(approved, waiting)
	};
}
