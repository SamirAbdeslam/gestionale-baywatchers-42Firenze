import { desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import type { User } from '../auth/session.ts';
import { assertAdmin, lockAdmin, loginPattern } from '../auth/guards.ts';
import { pools, poolEntries, settings } from '../db/schema.ts';
import { readCsv, writeCsv } from './csv.ts';
import { isoDate, digits } from './dates.ts';
import { EVENT_KINDS } from '#lib/kinds.ts';
import { poolStats, currentPoolEntries, type PoolEntry } from './pool.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { m } from '#lib/paraglide/messages.js';

const limit = 1024 * 1024;
const poolDate = isoDate.refine((date) => date >= '2000-01-01' && date <= '2100-12-31');
export type ArchiveNotice = {
	type: 'success' | 'error' | 'warning';
	key: 'archive_imported' | 'archive_duplicate' | 'archive_import_empty' | 'archive_bad_header';
	params: Record<string, never>;
};

// Fixed standard format: pool_entries columns in schema order, without id and pool_id.
export const ARCHIVE_COLUMNS = [
	'login',
	'title',
	'kind',
	'event_date',
	'weekday',
	'start_time',
	'end_time',
	'duration_minutes',
	'compensation',
	'attended',
	'registered_at',
	'week',
	'max_slots',
	'event_ref',
	'week_activated_at'
] as const;

export function archiveCsv(entries: readonly PoolEntry[]) {
	const time = (value: string | null) => value?.slice(0, 5) ?? null;
	return writeCsv([
		[...ARCHIVE_COLUMNS],
		...entries.map((entry) => [
			entry.login,
			entry.title,
			entry.kind,
			entry.eventDate,
			entry.weekday,
			time(entry.startTime),
			time(entry.endTime),
			entry.durationMinutes,
			entry.compensation,
			String(entry.attended),
			entry.registeredAt?.toISOString() ?? null,
			entry.week,
			entry.maxSlots,
			entry.eventRef,
			entry.weekActivatedAt?.toISOString() ?? null
		])
	]);
}

const optional = <T extends z.ZodType>(schema: T) =>
	z
		.literal('')
		.transform(() => null)
		.or(schema);
const count = (min: number, max: number) =>
	z
		.string()
		.regex(/^\d{1,10}$/)
		.transform(Number)
		.pipe(z.number().int().min(min).max(max));
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const instant = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/)
	.transform((value) => new Date(value))
	.refine((date) => !Number.isNaN(date.getTime()));
const rowSchemas = {
	login: z.string().regex(loginPattern),
	title: z.string().min(1).max(120),
	kind: z.enum(EVENT_KINDS),
	event_date: optional(isoDate.refine((date) => !date.startsWith('0000'))),
	weekday: optional(count(1, 7)),
	start_time: optional(clock),
	end_time: optional(clock),
	duration_minutes: count(0, 2147483647),
	compensation: count(0, 2147483647),
	attended: z.enum(['true', 'false']).transform((value) => value === 'true'),
	registered_at: optional(instant),
	week: optional(count(1, 4)),
	max_slots: optional(count(1, 2147483647)),
	event_ref: optional(count(0, 2147483647)),
	week_activated_at: optional(instant)
} satisfies Record<(typeof ARCHIVE_COLUMNS)[number], z.ZodType>;

export function parseArchiveCsv(bytes: Uint8Array) {
	z.number().positive().max(limit).parse(bytes.byteLength);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		text = Buffer.from(bytes).toString('latin1');
	}
	const [header, ...rows] = readCsv(text.replace(/^\uFEFF/, ''), ',');
	z.literal(ARCHIVE_COLUMNS.join(',')).parse(header?.cells.join(','));
	z.number().max(20000).parse(rows.length);
	const entries: PoolEntry[] = [];
	const skipped: {
		line: number;
		value: string;
		reason: 'archive_skip_columns' | 'archive_skip_invalid';
		column: string;
	}[] = [];
	for (const row of rows) {
		if (row.cells.every((cell) => !cell.trim())) continue;
		const value = row.cells.join(',');
		if (row.cells.length !== ARCHIVE_COLUMNS.length) {
			skipped.push({ line: row.line, value, reason: 'archive_skip_columns', column: '' });
			continue;
		}
		const parsed: Record<string, unknown> = {};
		const invalid = ARCHIVE_COLUMNS.find((column, i) => {
			// Inverse of the formula protection applied by writeCsv to text cells.
			const cell =
				column === 'login' || column === 'title'
					? row.cells[i].replace(/(^|;)'(?='*[=+\-@\t\r])/g, '$1')
					: row.cells[i];
			const result = rowSchemas[column].safeParse(cell);
			if (result.success) parsed[column] = result.data;
			return !result.success;
		});
		// A time range must be ordered and a weekday must match its date, like the events it came from.
		const date = parsed.event_date as string | null;
		const wrong =
			invalid ??
			(parsed.start_time && parsed.end_time && parsed.end_time! <= parsed.start_time!
				? 'end_time'
				: date &&
					  parsed.weekday &&
					  (new Date(`${date}T12:00:00Z`).getUTCDay() || 7) !== parsed.weekday
					? 'weekday'
					: undefined);
		if (wrong) {
			skipped.push({ line: row.line, value, reason: 'archive_skip_invalid', column: wrong });
			continue;
		}
		entries.push({
			login: parsed.login as string,
			title: parsed.title as string,
			kind: parsed.kind as PoolEntry['kind'],
			eventDate: date,
			weekday: parsed.weekday as number | null,
			startTime: parsed.start_time as string | null,
			endTime: parsed.end_time as string | null,
			durationMinutes: parsed.duration_minutes as number,
			compensation: parsed.compensation as number,
			attended: parsed.attended as boolean,
			registeredAt: parsed.registered_at as Date | null,
			week: parsed.week as number | null,
			maxSlots: parsed.max_slots as number | null,
			eventRef: parsed.event_ref as number | null,
			weekActivatedAt: parsed.week_activated_at as Date | null
		});
	}
	return {
		entries,
		skipped,
		rowsRead: rows.filter((row) => row.cells.some((cell) => cell.trim())).length
	};
}

function summary(entries: PoolEntry[]) {
	return {
		totals: poolStats(entries).totals,
		participants: [...new Set(entries.map((entry) => entry.login))].sort().map((login) => {
			const { taken, completed, hours, altarian, attendancePercent } = poolStats(entries, login);
			return { login, taken, completed, hours, altarian, attendancePercent };
		})
	};
}

export async function getArchive(database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const query = z
		.object({
			year: z
				.string()
				.regex(/^\d{4}$/)
				.optional(),
			pool: z
				.union([z.literal('current'), digits(10).pipe(z.number().int().positive().max(2147483647))])
				.optional()
		})
		.parse(input);
	const archived = await database.select().from(pools).orderBy(desc(pools.startDate));
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	const choices = archived.map((pool) => ({
		key: String(pool.id),
		startDate: pool.startDate,
		current: false
	}));
	if (config.poolStart && !archived.some((pool) => pool.startDate === config.poolStart))
		choices.push({ key: 'current', startDate: config.poolStart, current: true });
	choices.sort((a, b) => b.startDate.localeCompare(a.startDate));
	const years = [...new Set(choices.map((pool) => pool.startDate.slice(0, 4)))];
	const year = query.year ?? years[0] ?? '';
	const available = choices.filter((pool) => pool.startDate.startsWith(year));
	const selected =
		query.pool === undefined
			? (available[0] ?? null)
			: (available.find((pool) => pool.key === String(query.pool)) ?? null);
	if (query.pool !== undefined && !selected) error(400, m.error_invalid_input());
	const entries = !selected
		? []
		: selected.current
			? await currentPoolEntries(database, config.poolStart)
			: await database
					.select()
					.from(poolEntries)
					.where(eq(poolEntries.poolId, Number(selected.key)))
					.orderBy(poolEntries.id);
	return { years, year, choices: available, selected, ...summary(entries) };
}

const badHeader = {
	ok: false,
	preview: null,
	csv: null,
	start: null,
	end: null,
	status: 400 as const,
	messages: [{ type: 'error', key: 'archive_bad_header', params: {} }] satisfies ArchiveNotice[]
};

export async function previewPoolImport(_database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const { file, start, end } = z
		.object({
			start: poolDate,
			end: poolDate,
			file: z
				.instanceof(File)
				.refine((file) => /\.csv$/i.test(file.name) && file.size > 0 && file.size <= limit)
		})
		.refine(({ start, end }) => end >= start, { message: 'error_pool_end_before_start' })
		.parse(input);
	const bytes = new Uint8Array(await file.arrayBuffer());
	let parsed;
	try {
		parsed = parseArchiveCsv(bytes);
	} catch (cause) {
		if (cause instanceof z.ZodError && cause.issues.some((issue) => issue.code === 'invalid_value'))
			return badHeader;
		throw cause;
	}
	const { entries, ...preview } = parsed;
	return {
		ok: true,
		messages: [],
		preview: { ...preview, ...summary(entries), count: entries.length },
		csv: Buffer.from(bytes).toString('base64'),
		start,
		end
	};
}

export async function importPool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { csv, start, end } = z
		.object({
			start: poolDate,
			end: poolDate,
			confirmed: z.literal('yes'),
			csv: z
				.string()
				.min(1)
				.max(Math.ceil(limit / 3) * 4)
				.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
		})
		.refine(({ start, end }) => end >= start, { message: 'error_pool_end_before_start' })
		.parse(input);
	// Reparse the original bytes on confirmation; never trust client-supplied totals or entries.
	const { entries } = parseArchiveCsv(Buffer.from(csv, 'base64'));
	if (!entries.length)
		return {
			ok: false,
			messages: [
				{ type: 'warning', key: 'archive_import_empty', params: {} }
			] satisfies ArchiveNotice[]
		};
	const result = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [pool] = await tx
			.insert(pools)
			.values({ startDate: start, endDate: end, source: 'csv', archivedAt: now })
			.onConflictDoNothing({ target: pools.startDate })
			.returning();
		if (!pool) return null;
		// Dense CSVs can exceed Postgres' parameter limit even below the upload size limit.
		for (let offset = 0; offset < entries.length; offset += 1000)
			await tx
				.insert(poolEntries)
				.values(
					entries.slice(offset, offset + 1000).map((entry) => ({ ...entry, poolId: pool.id }))
				);
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'IMPORT_POOL',
			description: `Pool imported from CSV with ${entries.length} registrations.`,
			resourceType: 'pool',
			resourceId: String(pool.id),
			newValue: { archiveId: pool.id, entries: entries.length }
		});
		return { logId };
	});
	if (!result)
		return {
			ok: false,
			status: 400 as const,
			messages: [{ type: 'error', key: 'archive_duplicate', params: {} }] satisfies ArchiveNotice[]
		};
	publish({ type: 'log_created', id: result.logId });
	return {
		ok: true,
		messages: [{ type: 'success', key: 'archive_imported', params: {} }] satisfies ArchiveNotice[]
	};
}

// "current" exports the working tables; a number exports that archived pool.
export async function exportArchive(database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const { pool } = z
		.object({
			pool: z.union([
				z.literal('current'),
				digits(10).pipe(z.number().int().positive().max(2147483647))
			])
		})
		.parse(input);
	if (pool === 'current') {
		const [config] = await database.select().from(settings).where(eq(settings.id, 1));
		if (!config) throw new Error('Settings row is missing');
		return {
			startDate: config.poolStart ?? 'current',
			csv: archiveCsv(await currentPoolEntries(database, config.poolStart))
		};
	}
	const [archive] = await database.select().from(pools).where(eq(pools.id, pool));
	if (!archive) error(404, m.error_invalid_input());
	return {
		startDate: archive.startDate,
		csv: archiveCsv(
			await database
				.select()
				.from(poolEntries)
				.where(eq(poolEntries.poolId, pool))
				.orderBy(poolEntries.id)
		)
	};
}
