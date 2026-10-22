import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import {
	computeWeekDayDates,
	digits,
	isoDate,
	setPoolDates as poolDates,
	weekNumber
} from './dates.ts';

const week = digits(5).pipe(weekNumber);
const querySchema = z.object({ week: week.optional() });
const activeWeekSchema = z.strictObject({ week });
const maxEventsSchema = z.strictObject({
	maxEvents: digits(5).pipe(z.number().int().min(0).max(32767))
});
const poolDate = isoDate.refine((date) => date >= '2000-01-01' && date <= '2100-12-31');
const poolDatesSchema = z
	.strictObject({ start: poolDate, end: z.union([poolDate, z.literal('')]).optional() })
	.refine(({ start, end }) => !end || end >= start, { message: 'error_pool_end_before_start' });

export async function getAdminSettings(database: typeof db, actor: User | null, query: unknown) {
	assertAdmin(actor);
	const { week } = querySchema.parse(query);
	const [row] = await database.select().from(settings).where(eq(settings.id, 1));
	if (!row) throw new Error('Settings row is missing');
	const currentWeek = week ?? row.activeWeek;
	return {
		settings: row,
		week: currentWeek,
		dayDates: computeWeekDayDates(row.poolStart, currentWeek)
	};
}

async function saveSettings(
	database: typeof db,
	actor: User,
	changes: Partial<Omit<typeof settings.$inferInsert, 'id' | 'updatedAt'>>,
	entry: {
		actionType: 'UPDATE_SETTING' | 'ACTIVATE_WEEK';
		description: string;
		resourceId?: string;
	},
	info: RequestInfo,
	now: Date
) {
	const logId = await database.transaction(async (tx) => {
		await lockAdmin(tx, actor);
		const [before] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (!before) throw new Error('Settings row is missing');
		const keys = Object.keys(changes) as (keyof typeof changes)[];
		const oldValue = Object.fromEntries(keys.map((key) => [key, before[key]]));
		await tx
			.update(settings)
			.set({ ...changes, updatedAt: now })
			.where(eq(settings.id, 1));
		return audit(tx, {
			...info,
			actor,
			...entry,
			resourceType: 'setting',
			oldValue,
			newValue: changes
		});
	});
	publish({ type: 'log_created', id: logId });
}
export async function setActiveWeek(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { week } = activeWeekSchema.parse(input);
	await saveSettings(
		database,
		actor,
		{ activeWeek: week },
		{
			actionType: 'ACTIVATE_WEEK',
			description: `Settimana ${week} attivata`,
			resourceId: String(week)
		},
		info,
		now
	);
	publish({ type: 'week_activated', week });
}
export async function setMaxEvents(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { maxEvents } = maxEventsSchema.parse(input);
	await saveSettings(
		database,
		actor,
		{ maxEventsPerUser: maxEvents },
		{
			actionType: 'UPDATE_SETTING',
			description: `Impostato il numero massimo di eventi per utente a ${maxEvents}`
		},
		info,
		now
	);
}
export async function setPoolDates(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { start, end } = poolDatesSchema.parse(input);
	const dates = poolDates(start, end || undefined);
	poolDate.parse(dates.poolEnd);
	await saveSettings(
		database,
		actor,
		dates,
		{
			actionType: 'UPDATE_SETTING',
			description: `Date pool impostate. Inizio: ${dates.poolStart}, Fine: ${dates.poolEnd}`
		},
		info,
		now
	);
	publish({ type: 'event_changed', eventId: null, week: null, action: 'update' });
}
export async function resetDisplayWeek(
	database: typeof db,
	actor: User | null,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	await saveSettings(
		database,
		actor,
		{ displayWeek: 1 },
		{ actionType: 'UPDATE_SETTING', description: 'Settimana display reimpostata a 1' },
		info,
		now
	);
}
