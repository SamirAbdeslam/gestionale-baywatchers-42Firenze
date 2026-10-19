import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { settings } from '../db/schema.ts';
import { assertAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { computeWeekDayDates, isoDate, setPoolDates as poolDates, weekNumber } from './dates.ts';

const querySchema = z.object({ week: z.coerce.number().pipe(weekNumber).optional() });
const activeWeekSchema = z.strictObject({ week: z.coerce.number().pipe(weekNumber) });
const maxEventsSchema = z.strictObject({
	maxEvents: z
		.union([z.number(), z.string().trim().min(1)])
		.transform(Number)
		.pipe(z.number().int().min(0).max(32767))
});
const poolDatesSchema = z
	.strictObject({ start: isoDate, end: z.union([isoDate, z.literal('')]).optional() })
	.refine(({ start, end }) => !end || end >= start);
const resetSchema = z.strictObject({});

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
	description: string,
	info: RequestInfo,
	now: Date
) {
	const logId = await database.transaction(async (tx) => {
		const [row] = await tx
			.update(settings)
			.set({ ...changes, updatedAt: now })
			.where(eq(settings.id, 1))
			.returning({ id: settings.id });
		if (!row) throw new Error('Settings row is missing');
		return audit(tx, {
			...info,
			actor,
			actionType: changes.activeWeek === undefined ? 'UPDATE_SETTING' : 'ACTIVATE_WEEK',
			description,
			resourceType: 'setting',
			resourceId: changes.activeWeek === undefined ? undefined : String(changes.activeWeek)
		});
	});
	publish({ type: 'log_created', id: logId });
	if (changes.activeWeek !== undefined)
		publish({ type: 'week_activated', week: changes.activeWeek });
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
		`Settimana ${week} attivata`,
		info,
		now
	);
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
		`Impostato il numero massimo di eventi per utente a ${maxEvents}`,
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
	await saveSettings(
		database,
		actor,
		dates,
		`Date pool impostate. Inizio: ${dates.poolStart}, Fine: ${dates.poolEnd}`,
		info,
		now
	);
}
export async function resetDisplayWeek(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	resetSchema.parse(input);
	await saveSettings(
		database,
		actor,
		{ displayWeek: 1 },
		'Settimana display reimpostata a 1',
		info,
		now
	);
}
