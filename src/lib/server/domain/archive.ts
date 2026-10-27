import { desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import type { User } from '../auth/session.ts';
import { assertAdmin, lockAdmin, loginPattern } from '../auth/guards.ts';
import { pools, poolEntries, settings, events } from '../db/schema.ts';
import { readCsv } from './csv.ts';
import { isoDate, digits } from './dates.ts';
import { inferKind } from '#lib/kinds.ts';
import { poolStats, currentPoolEntries, poolPhase, type PoolEntry } from './pool.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { m } from '#lib/paraglide/messages.js';

const limit = 1024 * 1024;
const monthSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/)
	.transform((month) => `${month}-01`)
	.pipe(isoDate.refine((date) => !date.startsWith('0000')));
const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const detail = /^(.*) \(([^,()]+), (\d+(?:\.\d{1,2})?)h, (\d+₳|NON PARTECIPATO)\)$/s;
export type ArchiveNotice = {
	type: 'success' | 'error' | 'warning';
	key: 'archive_imported' | 'archive_duplicate' | 'archive_import_empty';
	params: Record<string, never>;
};

export function parseDetailedCsv(bytes: Uint8Array) {
	z.number().positive().max(limit).parse(bytes.byteLength);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		text = Buffer.from(bytes).toString('latin1');
	}
	const [header, ...rows] = readCsv(text.replace(/^\uFEFF/, ''), ',');
	z.literal('Nome Partecipante,Eventi Partecipati,Numero Eventi,Totale Ore,Totale Altarian').parse(
		header?.cells.join(',')
	);
	z.number().max(2000).parse(rows.length);
	const entries: PoolEntry[] = [];
	const skipped: {
		line: number;
		value: string;
		reason: 'archive_skip_row' | 'archive_skip_ambiguous' | 'archive_skip_entry';
	}[] = [];
	for (const row of rows) {
		if (row.cells.every((cell) => !cell.trim())) continue;
		const [login, list] = row.cells;
		if (row.cells.length !== 5 || !loginPattern.test(login)) {
			skipped.push({ line: row.line, value: row.cells.join(', '), reason: 'archive_skip_row' });
			continue;
		}
		if (!list.trim()) continue;
		const parts = list.split(' | ');
		// An incomplete fragment may be a title containing the list delimiter: reject the whole row.
		if (parts.some((part) => !detail.test(part))) {
			skipped.push({ line: row.line, value: list, reason: 'archive_skip_ambiguous' });
			continue;
		}
		for (const part of parts) {
			const [, title, dayDate, hours, payment] = detail.exec(part)!;
			const dateMatch =
				/^(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica) (\d{2})\/(\d{2})\/(\d{4})$/.exec(
					dayDate
				);
			const dayOnly = days.indexOf(dayDate.trim());
			const eventDate = dateMatch ? `${dateMatch[4]}-${dateMatch[3]}-${dateMatch[2]}` : null;
			const weekday = dateMatch ? days.indexOf(dateMatch[1]) + 1 : dayOnly + 1;
			let depth = 0;
			let balanced = true;
			for (const char of title) {
				if (char === '(') depth++;
				if (char === ')' && --depth < 0) balanced = false;
			}
			const minutes = Math.round(Number(hours) * 60);
			const compensation = payment === 'NON PARTECIPATO' ? 0 : Number(payment.slice(0, -1));
			const validDate =
				eventDate === null ||
				(!eventDate.startsWith('0000') &&
					isoDate.safeParse(eventDate).success &&
					(new Date(`${eventDate}T12:00:00Z`).getUTCDay() || 7) === weekday);
			if (
				!title.trim() ||
				title.includes(' | ') ||
				!balanced ||
				depth !== 0 ||
				/\d+(?:\.\d+)?h,/.test(title) ||
				weekday === 0 ||
				!validDate ||
				!Number.isSafeInteger(minutes) ||
				minutes > 2147483647 ||
				!Number.isSafeInteger(compensation) ||
				compensation > 2147483647
			) {
				skipped.push({ line: row.line, value: part, reason: 'archive_skip_entry' });
				continue;
			}
			entries.push({
				login,
				title,
				kind: inferKind(title),
				eventDate,
				weekday,
				durationMinutes: minutes,
				compensation,
				attended: payment !== 'NON PARTECIPATO',
				startTime: null,
				endTime: null,
				registeredAt: null
			});
		}
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

export async function getPoolPhase(database: typeof db, actor: User | null, now: Date) {
	assertAdmin(actor);
	const [config] = await database.select().from(settings).where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	return poolPhase(
		config,
		await database
			.select({ eventDate: events.eventDate, week: events.week, weekday: events.weekday })
			.from(events),
		now
	);
}

export async function previewPoolImport(_database: typeof db, actor: User | null, input: unknown) {
	assertAdmin(actor);
	const { file, month } = z
		.object({
			month: monthSchema,
			file: z
				.instanceof(File)
				.refine((file) => /\.csv$/i.test(file.name) && file.size > 0 && file.size <= limit)
		})
		.parse(input);
	const bytes = new Uint8Array(await file.arrayBuffer());
	const { entries, ...preview } = parseDetailedCsv(bytes);
	return {
		ok: true,
		messages: [],
		preview: { ...preview, ...summary(entries), count: entries.length },
		csv: Buffer.from(bytes).toString('base64'),
		month: month.slice(0, 7)
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
	const { csv, month } = z
		.object({
			month: monthSchema,
			confirmed: z.literal('yes'),
			csv: z
				.string()
				.min(1)
				.max(Math.ceil(limit / 3) * 4)
				.regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
		})
		.parse(input);
	// Reparse the original bytes on confirmation; never trust client-supplied totals or entries.
	const { entries } = parseDetailedCsv(Buffer.from(csv, 'base64'));
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
			.values({ startDate: month, endDate: null, source: 'csv', archivedAt: now })
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
			description: `Importata piscina da CSV con ${entries.length} iscrizioni.`,
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
