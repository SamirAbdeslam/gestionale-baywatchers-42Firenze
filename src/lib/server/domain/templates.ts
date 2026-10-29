import { error } from '@sveltejs/kit';
import { count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db, Transaction } from '../db/index.ts';
import type { User } from '../auth/session.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import { events, settings, templateEvents, weekTemplates } from '../db/schema.ts';
import { audit, type RequestInfo } from './audit.ts';
import { digits, weekNumber } from './dates.ts';
import { parseTemplateCsv, templateEventSchema } from './csv.ts';
import { inferKind, type EventKind } from '#lib/kinds.ts';
import { deletionSnapshot } from './events.ts';
import { publish } from '../realtime/bus.ts';
import { m } from '#lib/paraglide/messages.js';

const id = digits(10).pipe(z.number().int().min(1).max(2147483647));
export const templateSchema = z.object({
	name: z.string().trim().min(1).max(120),
	description: z.string().trim().max(500).default(''),
	targetWeek: digits(1).pipe(weekNumber),
	events: z.array(templateEventSchema).min(1).max(200)
});
export type TemplateNotice = {
	type: 'success' | 'warning';
	key:
		| 'template_created'
		| 'template_deleted'
		| 'template_applied'
		| 'template_existing'
		| 'template_empty'
		| 'template_week_empty'
		| 'template_import_empty'
		| 'template_imported'
		| 'template_skipped';
	params: {
		name?: string;
		count?: number;
		week?: number;
		deleted?: number;
		templates?: number;
		rows?: string;
	};
};
const notice = (
	type: TemplateNotice['type'],
	key: TemplateNotice['key'],
	params: TemplateNotice['params'] = {}
) => ({ type, key, params });

export async function listTemplates(database: typeof db, actor: User | null) {
	assertAdmin(actor);
	return database
		.select({
			id: weekTemplates.id,
			name: weekTemplates.name,
			description: weekTemplates.description,
			targetWeek: weekTemplates.targetWeek,
			createdAt: weekTemplates.createdAt,
			eventCount: count(templateEvents.id),
			kinds: sql<
				EventKind[]
			>`coalesce(array_agg(${templateEvents.kind} ORDER BY ${templateEvents.weekday}, ${templateEvents.startTime}, ${templateEvents.id}) FILTER (WHERE ${templateEvents.id} IS NOT NULL), '{}')`
		})
		.from(weekTemplates)
		.leftJoin(templateEvents, eq(templateEvents.templateId, weekTemplates.id))
		.groupBy(weekTemplates.id)
		.orderBy(desc(weekTemplates.createdAt), desc(weekTemplates.id));
}

export async function createTemplate(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { events: entries, ...details } = templateSchema.parse(input);
	const logId = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		return insertTemplate(
			tx,
			user,
			details,
			entries.map((entry) => ({ ...entry, kind: inferKind(entry.title) })),
			info,
			now
		);
	});
	publish({ type: 'log_created', id: logId });
	return {
		ok: true,
		messages: [notice('success', 'template_created', { name: details.name, count: entries.length })]
	};
}

async function insertTemplate(
	tx: Transaction,
	user: User,
	details: Omit<z.output<typeof templateSchema>, 'events'>,
	entries: (z.output<typeof templateEventSchema> & { kind: EventKind })[],
	info: RequestInfo,
	now: Date
) {
	const [template] = await tx
		.insert(weekTemplates)
		.values({ ...details, createdAt: now })
		.returning();
	await tx.insert(templateEvents).values(
		entries.map((entry) => ({
			...entry,
			templateId: template.id
		}))
	);
	return audit(tx, {
		...info,
		actor: user,
		actionType: 'CREATE_TEMPLATE',
		description: `Created template '${template.name}' for week ${template.targetWeek}.`,
		resourceType: 'template',
		resourceId: String(template.id)
	});
}

export async function saveWeekAsTemplate(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { week, ...details } = templateSchema
		.omit({ events: true })
		.extend({
			week: digits(1).pipe(weekNumber),
			targetWeek: digits(1).pipe(weekNumber).optional()
		})
		.parse(input);
	const targetWeek = details.targetWeek ?? week;
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const rows = await tx
			.select()
			.from(events)
			.where(eq(events.week, week))
			.orderBy(events.weekday, events.startTime, events.id)
			.for('update');
		if (!rows.length) return { ok: false, messages: [notice('warning', 'template_week_empty')] };
		const parsed = templateSchema.parse({
			...details,
			targetWeek,
			events: rows.map((row) => ({
				...row,
				startTime: row.startTime.slice(0, 5),
				endTime: row.endTime.slice(0, 5)
			}))
		});
		const logId = await insertTemplate(
			tx,
			user,
			{ name: parsed.name, description: parsed.description, targetWeek },
			parsed.events.map((entry, index) => ({
				...entry,
				kind: rows[index].kind
			})),
			info,
			now
		);
		return {
			ok: true,
			messages: [notice('success', 'template_created', { name: parsed.name, count: rows.length })],
			logId
		};
	});
	if ('logId' in result && result.logId !== undefined)
		publish({ type: 'log_created', id: result.logId });
	return { ok: result.ok, messages: result.messages };
}

export async function applyTemplate(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const parsed = z.object({ id, overwrite: z.literal('true').optional() }).parse(input);
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		const [template] = await tx
			.select()
			.from(weekTemplates)
			.where(eq(weekTemplates.id, parsed.id))
			.for('update');
		if (!template) error(404, m.error_template_not_found());
		const where = eq(events.week, template.targetWeek);
		const oldValue = await deletionSnapshot(tx, where);
		if (oldValue.length && !parsed.overwrite)
			return {
				ok: false,
				messages: [
					notice('warning', 'template_existing', {
						count: oldValue.length,
						week: template.targetWeek
					})
				]
			};
		const entries = await tx
			.select()
			.from(templateEvents)
			.where(eq(templateEvents.templateId, template.id))
			.orderBy(templateEvents.id);
		// An empty legacy template must leave the target week intact, as SQLite's uncommitted delete did.
		if (!entries.length) return { ok: false, messages: [notice('warning', 'template_empty')] };
		if (parsed.overwrite && oldValue.length)
			await tx.delete(events).where(
				inArray(
					events.id,
					oldValue.map((event) => event.id)
				)
			);
		await tx.insert(events).values(
			entries.map((entry) => ({
				title: entry.title,
				description: entry.description,
				kind: entry.kind,
				weekday: entry.weekday,
				startTime: entry.startTime,
				endTime: entry.endTime,
				maxSlots: entry.maxSlots,
				compensation: entry.compensation,
				week: template.targetWeek,
				createdAt: now,
				updatedAt: now
			}))
		);
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'APPLY_TEMPLATE',
			description: `Applied template '${template.name}' to week ${template.targetWeek}. Overwrite: ${!!parsed.overwrite}.`,
			resourceType: 'template',
			resourceId: String(template.id),
			oldValue: parsed.overwrite ? oldValue : undefined
		});
		return {
			ok: true,
			messages: [
				notice('success', 'template_applied', {
					name: template.name,
					count: entries.length,
					deleted: parsed.overwrite ? oldValue.length : 0,
					week: template.targetWeek
				})
			],
			week: template.targetWeek,
			logId
		};
	});
	if ('logId' in result && result.logId !== undefined) {
		publish({ type: 'log_created', id: result.logId });
		publish({ type: 'event_changed', eventId: null, week: result.week, action: 'update' });
	}
	return {
		ok: result.ok,
		messages: result.messages,
		...('week' in result ? { week: result.week } : {})
	};
}

export async function deleteTemplate(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const parsed = z.object({ id }).parse(input);
	const { template, logId } = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [template] = await tx
			.delete(weekTemplates)
			.where(eq(weekTemplates.id, parsed.id))
			.returning();
		if (!template) error(404, m.error_template_not_found());
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'DELETE_TEMPLATE',
			description: `Deleted template '${template.name}' (ID: ${template.id}).`,
			resourceType: 'template',
			resourceId: String(template.id)
		});
		return { template, logId };
	});
	publish({ type: 'log_created', id: logId });
	return { ok: true, messages: [notice('success', 'template_deleted', { name: template.name })] };
}

export async function importTemplates(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { file } = z
		.object({
			file: z.instanceof(File).refine((file) => /\.csv$/i.test(file.name) && file.size > 0)
		})
		.parse(input);
	const { grouped, skipped } = parseTemplateCsv(new Uint8Array(await file.arrayBuffer()));
	if (!grouped.size)
		return {
			ok: false,
			messages: [notice('warning', 'template_import_empty', { count: skipped.length })]
		};
	const total = [...grouped.values()].reduce((sum, entries) => sum + entries.length, 0);
	const logId = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		for (const [targetWeek, entries] of grouped) {
			const [template] = await tx
				.insert(weekTemplates)
				.values({
					name: `Week ${targetWeek} - Import CSV`,
					description: `Template imported from CSV with ${entries.length} events`,
					targetWeek,
					createdAt: now
				})
				.returning();
			await tx
				.insert(templateEvents)
				.values(entries.map((entry) => ({ ...entry, templateId: template.id })));
		}
		return audit(tx, {
			...info,
			actor: user,
			actionType: 'IMPORT_TEMPLATES',
			description: `Imported ${grouped.size} templates from CSV with ${total} total events.`,
			resourceType: 'template'
		});
	});
	publish({ type: 'log_created', id: logId });
	const messages = [
		notice('success', 'template_imported', { templates: grouped.size, count: total })
	];
	if (skipped.length)
		messages.push(
			notice('warning', 'template_skipped', {
				count: skipped.length,
				rows: skipped.slice(0, 20).join(', ')
			})
		);
	return { ok: true, messages };
}
