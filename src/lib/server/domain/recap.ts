import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, poolEntries, pools, registrations, settings } from '../db/schema.ts';
import { assertAdmin, assertUser } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import {
	badgesOf,
	currentPoolEntries,
	poolPhase,
	poolStats,
	type Badge,
	type PoolEntry
} from './pool.ts';
import { digits } from './dates.ts';
import { m } from '#lib/paraglide/messages.js';

export function calendarView(phase: ReturnType<typeof poolPhase>) {
	return {
		countdown: phase === 'upcoming',
		calendar: phase === 'open',
		recap: phase !== 'open'
	};
}

export async function personalPools(database: typeof db, actor: User | null) {
	assertUser(actor);
	const archived = await database
		.selectDistinct({ id: pools.id, startDate: pools.startDate })
		.from(pools)
		.innerJoin(
			poolEntries,
			and(eq(poolEntries.poolId, pools.id), eq(poolEntries.login, actor.login))
		)
		.orderBy(desc(pools.startDate));
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	const choices = [...archived];
	if (
		config.poolStart &&
		!archived.some((pool) => pool.startDate === config.poolStart) &&
		(
			await database
				.select({ id: registrations.id })
				.from(registrations)
				.where(eq(registrations.participantLogin, actor.login))
				.limit(1)
		).length > 0
	)
		choices.push({ id: 0, startDate: config.poolStart });
	return choices.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// The current pool uses live rows even when an older snapshot exists.
async function overallStats(database: typeof db, actor: User, startDate: string) {
	// Only pools where the login actually attended something count as done.
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	const choices = [];
	const perPool: PoolEntry[][] = [];
	for (const choice of await personalPools(database, actor)) {
		const own =
			choice.startDate === config.poolStart
				? await currentPoolEntries(database, choice.startDate, actor.login)
				: await database
						.select()
						.from(poolEntries)
						.where(and(eq(poolEntries.poolId, choice.id), eq(poolEntries.login, actor.login)));
		if (!own.some((row) => row.attended)) continue;
		choices.push(choice);
		perPool.push(own);
	}
	const all = perPool.flat();
	const stats = poolStats(all, actor.login);
	const earliest = choices.at(-1)?.startDate;
	const badges = new Set<Badge>(
		perPool.flatMap((rows, i) =>
			// Weekly badges only make sense inside a single pool.
			badgesOf(rows, { first: i === choices.length - 1, pools: choices.length })
		)
	);
	for (const badge of badgesOf(all, { first: false, pools: choices.length }))
		if (badge !== 'loyal') badges.add(badge);
	const favorite = [...stats.byKind].sort((a, b) => b.count - a.count)[0];
	return {
		pools: choices.length,
		taken: stats.taken,
		completed: stats.completed,
		hours: stats.hours,
		altarian: stats.altarian,
		byKind: stats.byKind,
		favoriteKind: favorite?.count ? favorite.kind : null,
		badges: [...badges],
		isFirst: earliest === startDate
	};
}

export async function getRecap(
	database: typeof db,
	actor: User | null,
	poolId?: string,
	whole = false
) {
	assertUser(actor);
	if (whole) assertAdmin(actor);
	let startDate: string | null;
	let exactStart: string | null;
	let entries: PoolEntry[];
	if (poolId !== undefined) {
		const id = digits(10).pipe(z.number().int().positive().max(2147483647)).parse(poolId);
		const [pool] = await database.select().from(pools).where(eq(pools.id, id));
		if (!pool) error(404, m.error_not_found());
		startDate = pool.startDate;
		exactStart = pool.source === 'site' ? pool.startDate : null;
		entries = await database.select().from(poolEntries).where(eq(poolEntries.poolId, id));
	} else {
		const [config] = await database.select().from(settings).where(eq(settings.id, 1));
		startDate = exactStart = config.poolStart;
		if (!startDate && !whole) {
			const last = (await personalPools(database, actor))[0];
			if (last) return getRecap(database, actor, String(last.id));
		}
		entries = await currentPoolEntries(database, startDate);
		if (!whole && !entries.some((row) => row.login === actor.login)) {
			// The current pool has nothing of this login: show the latest pool it took part in.
			const last = (await personalPools(database, actor)).find((pool) => pool.id);
			if (last) return getRecap(database, actor, String(last.id));
		}
		if (config.poolClosedAt && startDate && !entries.length) {
			const [archive] = await database.select().from(pools).where(eq(pools.startDate, startDate));
			if (archive) return getRecap(database, actor, String(archive.id), whole);
		}
	}
	if (!startDate || (!whole && !entries.some((row) => row.login === actor.login))) return null;
	const stats = poolStats(entries, whole ? undefined : actor.login, exactStart);
	// Whole-pool views expose aggregates only, including in serialized page data.
	if (whole) return { startDate, whole, stats: null, totals: stats.totals, overall: null };
	const overall = await overallStats(database, actor, startDate);
	const personal = {
		...stats,
		badges: badgesOf(
			entries.filter((row) => row.login === actor.login),
			{ first: overall.isFirst, pools: overall.pools }
		)
	};
	return { startDate, whole, stats: personal, totals: stats.totals, overall };
}

export async function calendarPoolView(database: typeof db, actor: User | null, now: Date) {
	assertUser(actor);
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	const phase = poolPhase(config, await database.select().from(events), now);
	const view = calendarView(phase);
	const choices =
		phase === 'none' || phase === 'upcoming' ? await personalPools(database, actor) : [];
	const last = choices.find((pool) => phase !== 'upcoming' || pool.startDate < config.poolStart!);
	return {
		...view,
		phase,
		poolStart: config.poolStart ? new Date(`${config.poolStart}T00:00:00`).toISOString() : null,
		now: now.getTime(),
		recapData:
			phase === 'closed'
				? await getRecap(database, actor)
				: (phase === 'none' || phase === 'upcoming') && last
					? await getRecap(database, actor, last.id ? String(last.id) : undefined)
					: null
	};
}
