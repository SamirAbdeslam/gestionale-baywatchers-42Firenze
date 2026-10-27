import { count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Database } from '../db/index.ts';
import { events, registrations, settings, whitelist, pools, poolEntries } from '../db/schema.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { deletionSnapshot } from './events.ts';
import { publish } from '../realtime/bus.ts';
import { concreteDate, romeDateTime } from './dates.ts';
import { durationMinutes } from './reports.ts';
import { EVENT_KINDS } from '#lib/kinds.ts';

const checkbox = z.literal('yes').optional();
const closureSchema = z.strictObject({
	downloaded: checkbox,
	events: checkbox,
	whitelist: checkbox,
	weeks: checkbox,
	dates: checkbox
});
export type PoolNotice = {
	type: 'success' | 'warning';
	key: 'pool_closed' | 'pool_download_required' | 'pool_dates_required';
	params: Record<string, never>;
};

export function preparePoolClosure(actor: User | null, input: unknown) {
	assertAdmin(actor);
	const choices = closureSchema.parse(input);
	const key = !choices.downloaded ? 'pool_download_required' : null;
	const messages: PoolNotice[] = key ? [{ type: 'warning', key, params: {} }] : [];
	return { choices: key ? null : choices, messages };
}

export async function closePool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { choices, messages } = preparePoolClosure(actor, input);
	if (!choices) return { ok: false, messages };
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [before] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (!before) throw new Error('Settings row is missing');

		if (!before.poolStart) return null;
		const snapshot = await deletionSnapshot(tx, undefined);
		const entries = await currentPoolEntries(tx, before.poolStart);
		const [archive] = await tx
			.insert(pools)
			.values({
				startDate: before.poolStart,
				endDate: before.poolEnd,
				source: 'site',
				archivedAt: now
			})
			.onConflictDoUpdate({
				target: pools.startDate,
				set: {
					endDate: before.poolEnd,
					source: entries.length ? 'site' : undefined,
					archivedAt: now
				}
			})
			.returning();
		if (entries.length) {
			await tx.delete(poolEntries).where(eq(poolEntries.poolId, archive.id));
			await tx
				.insert(poolEntries)
				.values(entries.map((entry) => ({ ...entry, poolId: archive.id })));
		}
		const [{ n: archivedEntries }] = await tx
			.select({ n: count() })
			.from(poolEntries)
			.where(eq(poolEntries.poolId, archive.id));
		const removedEvents = choices.events ? snapshot : undefined;
		const removedWhitelist = choices.whitelist
			? await tx.select().from(whitelist).orderBy(whitelist.id).for('update')
			: undefined;
		const oldSettings = {
			...(choices.weeks ? { activeWeek: before.activeWeek, displayWeek: before.displayWeek } : {}),
			...(choices.dates ? { poolStart: before.poolStart, poolEnd: before.poolEnd } : {})
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
		if (choices.weeks || choices.dates)
			await tx
				.update(settings)
				.set({
					...(choices.weeks ? { activeWeek: 1, displayWeek: 1 } : {}),
					...(choices.dates ? { poolStart: null, poolEnd: null } : {}),
					updatedAt: now
				})
				.where(eq(settings.id, 1));
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'CLOSE_POOL',
			description: 'Chiusura della piscina.',
			resourceType: 'pool',
			resourceId: String(archive.id),
			newValue: { archiveId: archive.id, entries: archivedEntries },
			oldValue: {
				...(removedEvents ? { events: removedEvents } : {}),
				...(removedWhitelist ? { whitelist: removedWhitelist } : {}),
				...(choices.weeks || choices.dates ? { settings: oldSettings } : {})
			}
		});
		return { logId };
	});
	if (!result)
		return {
			ok: false,
			messages: [{ type: 'warning', key: 'pool_dates_required', params: {} }] satisfies PoolNotice[]
		};
	publish({ type: 'log_created', id: result.logId });
	publish({ type: 'event_changed', eventId: null, week: null, action: 'bulk_delete' });
	return {
		ok: true,
		messages: [{ type: 'success', key: 'pool_closed', params: {} }] satisfies PoolNotice[]
	};
}

export function poolPhase(
	config: { poolStart: string | null; poolEnd: string | null },
	rows: { eventDate: string | null; week: number; weekday: number }[],
	now: Date
): 'none' | 'upcoming' | 'active' | 'finished' {
	if (!config.poolStart) return 'none';
	const today = romeDateTime(now).slice(0, 10);
	if (today < config.poolStart) return 'upcoming';
	if (
		config.poolEnd &&
		today > config.poolEnd &&
		!rows.some((row) => {
			const date = concreteDate(row, config.poolStart);
			return date !== null && date > config.poolEnd!;
		})
	)
		return 'finished';
	return 'active';
}

export type PoolEntry = Omit<typeof poolEntries.$inferSelect, 'id' | 'poolId'>;

// Current and archived pools share the same statistics input, including absences.
export async function currentPoolEntries(
	database: Database,
	poolStart: string | null
): Promise<PoolEntry[]> {
	const rows = await database
		.select({ event: events, registration: registrations })
		.from(events)
		.innerJoin(registrations, eq(events.id, registrations.eventId))
		.orderBy(events.id, registrations.participantLogin);
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
		registeredAt: registration.registeredAt
	}));
}

export function poolStats(entries: readonly PoolEntry[], login?: string) {
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
		// Stable tie-break: earliest day/month or morning before afternoon/evening.
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
	const badges: ('early_bird' | 'all_rounder' | 'always_there')[] = [];
	if (attended.length && times.filter((time) => time === 0).length > attended.length / 2)
		badges.push('early_bird');
	if (personal.byKind.filter((kind) => kind.count > 0).length >= 3) badges.push('all_rounder');
	if (personal.taken >= 3 && personal.completed === personal.taken) badges.push('always_there');
	return {
		...personal,
		favoriteWeekday: mostFrequent(
			attended.flatMap((row) => (row.weekday === null ? [] : [row.weekday]))
		),
		favoriteTimeBand:
			timeBand === null ? null : (['morning', 'afternoon', 'evening'] as const)[timeBand],
		busiestMonth: mostFrequent(dated.map((row) => row.eventDate!.slice(0, 7))),
		firstShift: dated[0] ?? null,
		lastShift: dated.at(-1) ?? null,
		contributionPercent: totals.minutes ? (personal.minutes / totals.minutes) * 100 : 0,
		badges,
		totals
	};
}
