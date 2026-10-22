import { and, count, desc, eq, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import type { db } from '../db/index.ts';
import type { User } from '../auth/session.ts';
import { assertAdmin } from '../auth/guards.ts';
import { actionLogs } from '../db/schema.ts';
import { digits, isoDate } from './dates.ts';
import { writeCsv } from './csv.ts';

const filtersSchema = z.object({
	date: z.union([z.literal(''), isoDate.refine((date) => !date.startsWith('0000'))]).default(''),
	user: z.string().max(200).default(''),
	action: z.string().max(100).default(''),
	page: digits(10).pipe(z.number().int().min(1).max(2147483647)).default(1)
});
function filters(input: unknown) {
	const result = filtersSchema.safeParse(input);
	if (!result.success) error(400, m.error_invalid_input());
	return result.data;
}
function where(input: ReturnType<typeof filters>) {
	return and(
		input.date
			? sql`${actionLogs.createdAt} >= (${input.date}::date::timestamp AT TIME ZONE 'Europe/Rome') AND ${actionLogs.createdAt} < ((${input.date}::date + 1)::timestamp AT TIME ZONE 'Europe/Rome')`
			: undefined,
		input.user ? eq(actionLogs.actorLogin, input.user) : undefined,
		input.action ? eq(actionLogs.actionType, input.action) : undefined
	);
}
export async function getLogs(database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const parsed = filters(input);
	const condition = where(parsed);
	const [total] = await database.select({ count: count() }).from(actionLogs).where(condition);
	const totalPages = Math.max(1, Math.ceil(total.count / 50));
	const page = Math.min(parsed.page, totalPages);
	const rows = await database
		.select()
		.from(actionLogs)
		.where(condition)
		.orderBy(desc(actionLogs.createdAt), desc(actionLogs.id))
		.limit(50)
		.offset((page - 1) * 50);
	const users = await database
		.selectDistinct({ value: actionLogs.actorLogin })
		.from(actionLogs)
		.orderBy(actionLogs.actorLogin);
	const actions = await database
		.selectDistinct({ value: actionLogs.actionType })
		.from(actionLogs)
		.orderBy(actionLogs.actionType);
	return {
		rows,
		total: total.count,
		totalPages,
		page,
		filters: { date: parsed.date, user: parsed.user, action: parsed.action },
		users: users.map((row) => row.value),
		actions: actions.map((row) => row.value)
	};
}

export function logCategory(action: string) {
	const value = action.toLowerCase();
	if (/create|add|import|apply/.test(value)) return 'create';
	if (/update|set|edit|mark|activate/.test(value)) return 'update';
	if (/delete|remove|unregister/.test(value)) return 'delete';
	if (/register/.test(value)) return 'register';
	return 'other';
}
const csvClock = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Rome',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});
export function logsCsv(rows: (typeof actionLogs.$inferSelect)[]) {
	return writeCsv(
		[
			[
				'ID',
				'Data e ora',
				'ID utente',
				'Utente',
				'Tipo azione',
				'Descrizione',
				'IP',
				'User agent',
				'ID risorsa',
				'Tipo risorsa',
				'Valore precedente',
				'Nuovo valore'
			],
			...rows.map((row) => [
				row.id,
				csvClock.format(row.createdAt),
				row.actorUserId ?? '',
				row.actorLogin,
				row.actionType,
				row.description,
				row.ipAddress ?? '',
				row.userAgent ?? '',
				row.resourceId ?? '',
				row.resourceType ?? '',
				row.oldValue === null ? '' : JSON.stringify(row.oldValue),
				row.newValue === null ? '' : JSON.stringify(row.newValue)
			])
		],
		'\r\n'
	);
}
export async function exportLogs(database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const parsed = filters(input);
	return logsCsv(
		await database
			.select()
			.from(actionLogs)
			.where(where(parsed))
			.orderBy(desc(actionLogs.createdAt), desc(actionLogs.id))
	);
}
