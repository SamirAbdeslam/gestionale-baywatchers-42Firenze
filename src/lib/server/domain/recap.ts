import { error } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, poolEntries, pools, settings } from '../db/schema.ts';
import { assertAdmin, assertUser } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { currentPoolEntries, poolPhase, poolStats, type PoolEntry } from './pool.ts';
import { digits } from './dates.ts';
import { m } from '#lib/paraglide/messages.js';

export function calendarView(phase: ReturnType<typeof poolPhase>) {
	return {
		countdown: phase === 'upcoming',
		calendar: phase === 'active' || phase === 'finished',
		recap: phase === 'none' || phase === 'finished'
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
		(await currentPoolEntries(database, config.poolStart)).some((row) => row.login === actor.login)
	)
		choices.push({ id: 0, startDate: config.poolStart });
	return choices.sort((a, b) => b.startDate.localeCompare(a.startDate));
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
	}
	if (!startDate || (!whole && !entries.some((row) => row.login === actor.login))) return null;
	const stats = poolStats(entries, whole ? undefined : actor.login, exactStart);
	// Whole-pool views expose aggregates only, including in serialized page data.
	return { startDate, whole, stats: whole ? null : stats, totals: stats.totals };
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
		lastRecap: last?.id ?? null,
		recapData:
			phase === 'finished'
				? await getRecap(database, actor)
				: phase === 'none' && last
					? await getRecap(database, actor, last.id ? String(last.id) : undefined)
					: null
	};
}
