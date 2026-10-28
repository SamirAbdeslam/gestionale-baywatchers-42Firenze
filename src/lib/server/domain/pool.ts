import { isHttpError } from '@sveltejs/kit';
import { count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Database, Transaction } from '../db/index.ts';
import {
	events,
	registrations,
	settings,
	whitelist,
	enrollmentRequests,
	pools,
	poolEntries,
	weekActivations
} from '../db/schema.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, SYSTEM_ACTOR, type RequestInfo } from './audit.ts';
import { deletionSnapshot } from './events.ts';
import { publish } from '../realtime/bus.ts';
import { concreteDate, romeDateTime } from './dates.ts';
import { durationMinutes } from './reports.ts';
import { EVENT_KINDS } from '#lib/kinds.ts';

const confirmationSchema = z.strictObject({ confirm: z.literal('yes') });
const checkbox = z.literal('yes').optional();
const cleanupSchema = confirmationSchema.extend({
	events: checkbox,
	whitelist: checkbox,
	weeks: checkbox,
	dates: checkbox,
	save: z.enum(['yes', 'no'])
});
export type PoolNotice = {
	type: 'success' | 'warning' | 'error';
	key:
		| 'pool_closed'
		| 'pool_reopened'
		| 'pool_saved'
		| 'pool_cleaned'
		| 'pool_dates_required'
		| 'pool_dates_locked'
		| 'pool_cleanup_failed'
		| 'pool_cleanup_closed'
		| 'pool_cleanup_empty';
	params: Record<string, never>;
};
const notice = (key: PoolNotice['key'], ok = true) => ({
	ok,
	messages: [{ type: ok ? 'success' : 'error', key, params: {} }] satisfies PoolNotice[]
});
type PoolConfig = Pick<typeof settings.$inferSelect, 'poolStart' | 'poolEnd'> &
	Partial<Pick<typeof settings.$inferSelect, 'poolClosedAt' | 'poolReopened'>>;
type PoolEvent = { eventDate: string | null; week: number; weekday: number };

export function poolPhase(
	config: PoolConfig,
	rows: PoolEvent[],
	now: Date
): 'none' | 'upcoming' | 'open' | 'closed' {
	if (!config.poolStart || !config.poolEnd) return 'none';
	if (config.poolClosedAt) return 'closed';
	const today = romeDateTime(now).slice(0, 10);
	if (today < config.poolStart) return 'upcoming';
	if (
		!config.poolReopened &&
		today > config.poolEnd &&
		!rows.some((row) => {
			const date = concreteDate(row, config.poolStart);
			return date !== null && date > config.poolEnd!;
		})
	)
		return 'closed';
	return 'open';
}

// The settings lock serializes closure, saving and cleanup with registration changes.
async function lockedSettings(tx: Transaction) {
	const [config] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
	if (!config) throw new Error('Settings row is missing');
	return config;
}
async function saveArchive(tx: Transaction, config: typeof settings.$inferSelect, now: Date) {
	if (!config.poolStart || !config.poolEnd) throw new Error('Pool dates are missing');
	const entries = await currentPoolEntries(tx, config.poolStart);
	const [existing] = await tx.select().from(pools).where(eq(pools.startDate, config.poolStart));
	// An empty working set must never erase an archive left by an earlier cleanup.
	if (entries.length || !existing) {
		const [archive] = await tx
			.insert(pools)
			.values({
				startDate: config.poolStart,
				endDate: config.poolEnd,
				source: 'site',
				archivedAt: now
			})
			.onConflictDoUpdate({
				target: pools.startDate,
				set: {
					endDate: config.poolEnd,
					source: 'site',
					archivedAt: now
				}
			})
			.returning();
		await tx.delete(poolEntries).where(eq(poolEntries.poolId, archive.id));
		for (let offset = 0; offset < entries.length; offset += 1000)
			await tx
				.insert(poolEntries)
				.values(
					entries.slice(offset, offset + 1000).map((entry) => ({ ...entry, poolId: archive.id }))
				);
	}
	const [archive] = await tx.select().from(pools).where(eq(pools.startDate, config.poolStart));
	if (!archive) throw new Error('Archive verification failed');
	const [{ n }] = await tx
		.select({ n: count() })
		.from(poolEntries)
		.where(eq(poolEntries.poolId, archive.id));
	if ((entries.length || !existing) && n !== entries.length)
		throw new Error('Archive count verification failed');
	return { archiveId: archive.id, entries: n };
}

async function writeClosure(
	tx: Transaction,
	config: typeof settings.$inferSelect,
	actor: Pick<User, 'id' | 'login'> | typeof SYSTEM_ACTOR,
	info: RequestInfo,
	now: Date
) {
	const archive = await saveArchive(tx, config, now);
	await tx
		.update(settings)
		.set({ poolClosedAt: now, poolReopened: false, updatedAt: now })
		.where(eq(settings.id, 1));
	return audit(tx, {
		...info,
		actor,
		actionType: 'CLOSE_POOL',
		description: 'Chiusura della piscina.',
		resourceType: 'pool',
		resourceId: String(archive.archiveId),
		newValue: archive
	});
}
function publishClosure(logId: number) {
	publish({ type: 'log_created', id: logId });
	publish({ type: 'pool_closed' });
}
export async function autoClosePool(database: typeof db, now: Date) {
	const [current] = await database.select().from(settings).where(eq(settings.id, 1));
	if (
		!current ||
		!current.poolStart ||
		!current.poolEnd ||
		current.poolClosedAt ||
		current.poolReopened ||
		romeDateTime(now).slice(0, 10) <= current.poolEnd
	)
		return;
	const logId = await database.transaction(async (tx) => {
		const config = await lockedSettings(tx);
		if (config.poolClosedAt || config.poolReopened) return null;
		const rows = await tx.select().from(events).orderBy(events.id).for('update');
		if (poolPhase(config, rows, now) !== 'closed') return null;
		return writeClosure(tx, config, SYSTEM_ACTOR, { ipAddress: '', userAgent: null }, now);
	});
	if (logId !== null) publishClosure(logId);
}
export async function closePool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	confirmationSchema.parse(input);
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const config = await lockedSettings(tx);
		if (!config.poolStart || !config.poolEnd) return null;
		if (config.poolClosedAt) return { logId: null };
		await tx.select().from(events).orderBy(events.id).for('update');
		return { logId: await writeClosure(tx, config, user, info, now) };
	});
	if (!result) return notice('pool_dates_required', false);
	if (result.logId !== null) publishClosure(result.logId);
	return notice('pool_closed');
}
export async function reopenPool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	confirmationSchema.parse(input);
	const logId = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const config = await lockedSettings(tx);
		if (!config.poolStart || !config.poolEnd || !config.poolClosedAt) return null;
		await tx
			.update(settings)
			.set({ poolClosedAt: null, poolReopened: true, updatedAt: now })
			.where(eq(settings.id, 1));
		return audit(tx, {
			...info,
			actor: user,
			actionType: 'REOPEN_POOL',
			description: 'Riapertura della piscina.',
			resourceType: 'pool'
		});
	});
	if (logId === null) return notice('pool_dates_required', false);
	publish({ type: 'log_created', id: logId });
	publish({ type: 'event_changed', eventId: null, week: null, action: 'update' });
	return notice('pool_reopened');
}
export async function savePool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	z.strictObject({}).parse(input);
	const logId = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const config = await lockedSettings(tx);
		if (!config.poolStart || !config.poolEnd) return null;
		await tx.select().from(events).orderBy(events.id).for('update');
		const archive = await saveArchive(tx, config, now);
		return audit(tx, {
			...info,
			actor: user,
			actionType: 'SAVE_POOL',
			description: 'Salvataggio archivio piscina.',
			resourceType: 'pool',
			resourceId: String(archive.archiveId),
			newValue: archive
		});
	});
	if (logId === null) return notice('pool_dates_required', false);
	publish({ type: 'log_created', id: logId });
	return notice('pool_saved');
}
export async function cleanPool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const choices = cleanupSchema.parse(input);
	if (!choices.events && !choices.whitelist && !choices.weeks && !choices.dates)
		return notice('pool_cleanup_empty', false);
	let result;
	try {
		result = await database.transaction(async (tx) => {
			const user = await lockAdmin(tx, actor);
			const before = await lockedSettings(tx);
			if (!before.poolClosedAt || !before.poolStart || !before.poolEnd) return null;
			const snapshot = await deletionSnapshot(tx, undefined);
			if (choices.save === 'yes') await saveArchive(tx, before, now);
			const [archive] = await tx.select().from(pools).where(eq(pools.startDate, before.poolStart));
			if (!archive) throw new Error('Archive verification failed');
			const removedEvents = choices.events ? snapshot : undefined;
			const removedWhitelist = choices.whitelist
				? await tx.select().from(whitelist).orderBy(whitelist.id).for('update')
				: undefined;
			const removedRequests = choices.whitelist
				? await tx.select().from(enrollmentRequests).orderBy(enrollmentRequests.login).for('update')
				: undefined;
			const oldSettings = {
				...(choices.weeks
					? { activeWeek: before.activeWeek, displayWeek: before.displayWeek }
					: {}),
				...(choices.dates
					? {
							poolStart: before.poolStart,
							poolEnd: before.poolEnd,
							poolClosedAt: before.poolClosedAt,
							poolReopened: before.poolReopened
						}
					: {})
			};
			if (removedEvents?.length)
				await tx.delete(events).where(
					inArray(
						events.id,
						removedEvents.map((row) => row.id)
					)
				);
			if (removedWhitelist?.length)
				await tx.delete(whitelist).where(
					inArray(
						whitelist.id,
						removedWhitelist.map((row) => row.id)
					)
				);
			if (choices.whitelist) await tx.delete(enrollmentRequests);
			if (choices.weeks || choices.dates)
				await tx
					.update(settings)
					.set({
						...(choices.weeks ? { activeWeek: 1, displayWeek: 1 } : {}),
						...(choices.dates
							? {
									poolStart: null,
									poolEnd: null,
									poolClosedAt: null,
									poolReopened: false,
									enrollmentCode: null
								}
							: {}),
						updatedAt: now
					})
					.where(eq(settings.id, 1));
			if (choices.weeks) await tx.delete(weekActivations);
			return audit(tx, {
				...info,
				actor: user,
				actionType: 'CLEAN_POOL',
				description: 'Pulizia della piscina.',
				resourceType: 'pool',
				resourceId: String(archive.id),
				oldValue: {
					...(removedEvents ? { events: removedEvents } : {}),
					...(removedWhitelist
						? { whitelist: removedWhitelist, enrollmentRequests: removedRequests }
						: {}),
					...(choices.weeks || choices.dates ? { settings: oldSettings } : {})
				}
			});
		});
	} catch (cause) {
		// Authorization errors retain their status; operational failures never permit partial cleanup.
		if (isHttpError(cause)) throw cause;
		return notice('pool_cleanup_failed', false);
	}
	if (result === null) return notice('pool_cleanup_closed', false);
	publish({ type: 'log_created', id: result });
	publish({ type: 'event_changed', eventId: null, week: null, action: 'bulk_delete' });
	return notice('pool_cleaned');
}

export type PoolEntry = Omit<typeof poolEntries.$inferSelect, 'id' | 'poolId'>;

// Current and archived pools share the same statistics input, including absences.
export async function currentPoolEntries(
	database: Database,
	poolStart: string | null,
	login?: string
): Promise<PoolEntry[]> {
	const rows = await database
		.select({ event: events, registration: registrations })
		.from(events)
		.innerJoin(registrations, eq(events.id, registrations.eventId))
		.where(login === undefined ? undefined : eq(registrations.participantLogin, login))
		.orderBy(events.id, registrations.participantLogin);
	const activations = new Map(
		(await database.select().from(weekActivations)).map((row) => [row.week, row.activatedAt])
	);
	return rows.map(({ event, registration }) => ({
		login: registration.participantLogin,
		title: event.title,
		kind: event.kind,
		eventDate: concreteDate(event, poolStart),
		weekday: event.weekday,
		startTime: event.startTime,
		endTime: event.endTime,
		durationMinutes: durationMinutes(event.startTime, event.endTime),
		compensation: event.compensation,
		attended: registration.attended,
		registeredAt: registration.registeredAt,
		week: event.week,
		maxSlots: event.maxSlots,
		eventRef: event.id,
		weekActivatedAt: activations.get(event.week) ?? null
	}));
}

export type Badge =
	| 'early_bird'
	| 'all_rounder'
	| 'always_there'
	| 'night_owl'
	| 'weekend_warrior'
	| 'marathoner'
	| 'loyal'
	| 'exam_keeper'
	| 'debutant'
	| 'veteran'
	| 'quick_reflexes';

// Descriptive badges for one login. Badges that need missing data (times, week, activation) are skipped.
export function badgesOf(
	rows: readonly PoolEntry[],
	context: { first: boolean; pools: number }
): Badge[] {
	const attended = rows.filter((row) => row.attended);
	const starts = attended.flatMap((row) =>
		row.startTime === null ? [] : [Number(row.startTime.slice(0, 2))]
	);
	const found: Badge[] = [];
	if (starts.filter((hour) => hour < 12).length > attended.length / 2 && attended.length)
		found.push('early_bird');
	if (EVENT_KINDS.filter((kind) => attended.some((row) => row.kind === kind)).length >= 3)
		found.push('all_rounder');
	if (rows.length >= 3 && attended.length === rows.length) found.push('always_there');
	if (starts.length && starts.filter((hour) => hour >= 18).length > starts.length / 2)
		found.push('night_owl');
	if (attended.some((row) => row.weekday === 6 || row.weekday === 7)) found.push('weekend_warrior');
	if (attended.some((row) => row.durationMinutes >= 240)) found.push('marathoner');
	if ([1, 2, 3, 4].every((week) => attended.some((row) => row.week === week))) found.push('loyal');
	if (attended.filter((row) => row.kind === 'exam').length > attended.length / 2)
		found.push('exam_keeper');
	if (context.first) found.push('debutant');
	if (context.pools >= 3) found.push('veteran');
	if (
		rows.some((row) => {
			if (!row.registeredAt || !row.weekActivatedAt) return false;
			const delay = row.registeredAt.getTime() - row.weekActivatedAt.getTime();
			return delay >= 0 && delay <= 5 * 60000;
		})
	)
		found.push('quick_reflexes');
	return found;
}

export function poolStats(
	entries: readonly PoolEntry[],
	login?: string,
	poolStart: string | null = null
) {
	const selected = login === undefined ? entries : entries.filter((row) => row.login === login);
	const summarize = (rows: readonly PoolEntry[]) => {
		const attended = rows.filter((row) => row.attended);
		return {
			taken: rows.length,
			completed: attended.length,
			minutes: attended.reduce((sum, row) => sum + row.durationMinutes, 0),
			hours: Number((attended.reduce((sum, row) => sum + row.durationMinutes, 0) / 60).toFixed(2)),
			altarian: attended.reduce((sum, row) => sum + row.compensation, 0),
			participants: new Set(rows.map((row) => row.login)).size,
			attendancePercent: rows.length ? (attended.length / rows.length) * 100 : 0,
			byKind: EVENT_KINDS.map((kind) => {
				const count = attended.filter((row) => row.kind === kind).length;
				return { kind, count, percent: attended.length ? (count / attended.length) * 100 : 0 };
			})
		};
	};
	const totals = summarize(entries);
	const personal = summarize(selected);
	const attended = selected.filter((row) => row.attended);
	const mostFrequent = <T extends string | number>(values: T[]): T | null => {
		const counts = new Map<T, number>();
		for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
		// Stable tie-break: earliest day/week or morning before afternoon/evening.
		return (
			[...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ??
			null
		);
	};
	const times = attended.flatMap((row) =>
		row.startTime === null
			? []
			: [
					Number(row.startTime.slice(0, 2)) < 12
						? 0
						: Number(row.startTime.slice(0, 2)) < 18
							? 1
							: 2
				]
	);
	const timeBand = mostFrequent(times);
	const dated = attended
		.filter((row) => row.eventDate !== null)
		.sort(
			(a, b) =>
				a.eventDate!.localeCompare(b.eventDate!) ||
				(a.startTime ?? '').localeCompare(b.startTime ?? '') ||
				a.title.localeCompare(b.title)
		);
	// The stored week is exact; dates measured from the pool start are the fallback for old archives.
	const weekOf = (row: PoolEntry, index: number) =>
		attended.every((entry) => entry.week !== null)
			? row.week === index + 1
			: Math.floor((Date.parse(row.eventDate!) - Date.parse(poolStart!)) / 86400000 / 7) === index;
	const weekCounts =
		attended.length &&
		(attended.every((row) => row.week !== null) ||
			(poolStart && attended.every((row) => row.eventDate !== null)))
			? Array.from({ length: 4 }, (_, index) => ({
					week: index + 1,
					count: attended.filter((row) => weekOf(row, index)).length
				}))
			: null;
	return {
		...personal,
		favoriteWeekday: mostFrequent(
			attended.flatMap((row) => (row.weekday === null ? [] : [row.weekday]))
		),
		favoriteTimeBand:
			timeBand === null ? null : (['morning', 'afternoon', 'evening'] as const)[timeBand],
		weekCounts,
		busiestWeek:
			weekCounts
				?.filter((week) => week.count > 0)
				.sort((a, b) => b.count - a.count || a.week - b.week)[0]?.week ?? null,
		firstShift: dated[0] ?? null,
		lastShift: dated.at(-1) ?? null,
		contributionPercent: totals.minutes ? (personal.minutes / totals.minutes) * 100 : 0,
		totals
	};
}
