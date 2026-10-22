import { z } from 'zod';
import { digits, isoDate, weekNumber } from './dates.ts';
import { inferKind } from './kinds.ts';

import { editable, timeOrder } from './events.ts';

export const templateEventSchema = z
	.object({
		...editable,
		maxSlots: editable.maxSlots.default(2),
		compensation: editable.compensation.default(0),
		eventDate: z
			.union([isoDate, z.literal('')])
			.nullish()
			.transform((value) => value || null)
	})
	.refine(timeOrder);

export function writeCsv(rows: (string | number | null)[][], lineEnding: '\n' | '\r\n' = '\n') {
	return (
		rows
			.map((row) =>
				row
					.map((value) => {
						const raw = String(value ?? '');
						const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
						return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
					})
					.join(',')
			)
			.join(lineEnding) + lineEnding
	);
}

// Quoted fields may contain separators, escaped quotes and line breaks.
function readCsv(text: string, separator: string) {
	const rows: { cells: string[]; line: number }[] = [];
	let cells: string[] = [],
		cell = '',
		quoted = false,
		line = 1,
		start = 1;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (char === '"') {
			if (quoted && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else quoted = !quoted;
		} else if (char === separator && !quoted) {
			cells.push(cell);
			cell = '';
		} else if ((char === '\n' || char === '\r') && !quoted) {
			cells.push(cell);
			rows.push({ cells, line: start });
			cells = [];
			cell = '';
			if (char === '\r' && text[i + 1] === '\n') i++;
			line++;
			start = line;
		} else {
			cell += char;
			if (char === '\n') line++;
		}
	}
	if (quoted) throw new z.ZodError([{ code: 'custom', path: [], message: 'Unclosed CSV quote' }]);
	if (cell || cells.length) rows.push({ cells: [...cells, cell], line: start });
	return rows;
}

export function parseTemplateCsv(bytes: Uint8Array) {
	z.number()
		.max(1024 * 1024)
		.parse(bytes.byteLength);
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		text = Buffer.from(bytes).toString('latin1');
	}
	text = text.replace(/^\uFEFF/, '');
	const sample = text.slice(0, 1024);
	const separator =
		(sample.match(/,/g)?.length ?? 0) > (sample.match(/;/g)?.length ?? 0) ? ',' : ';';
	const [header, ...rows] = readCsv(text, separator);
	z.number().max(2000).parse(rows.length);
	const columns = header?.cells.map((value) => value.trim()) ?? [];
	const grouped = new Map<
		number,
		(z.output<typeof templateEventSchema> & { kind: ReturnType<typeof inferKind> })[]
	>();
	const skipped: number[] = [];
	const days = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
	for (const row of rows) {
		const fields = Object.fromEntries(
			columns.map((name, i) => [name, (row.cells[i] ?? '').trim()])
		);
		const day = fields.Giorno?.toLowerCase()
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '');
		const times = fields.Orario?.split('-').map((value) => value.trim()) ?? [];
		const week = digits(1).pipe(weekNumber).safeParse(fields.Week);
		const event = templateEventSchema.safeParse({
			title: fields['Tipo Evento'],
			description: `${fields['Tipo Evento']} - ${fields.Compenso || '0'}₳`,
			weekday: days.indexOf(day) + 1,
			eventDate: fields.Data || fields.Date || null,
			startTime: times.length === 2 ? times[0] : '',
			endTime: times[1],
			maxSlots: fields.Partecipanti || '1',
			compensation: fields.Compenso || '0'
		});
		if (!week.success || !event.success) {
			skipped.push(row.line);
			continue;
		}
		const events = grouped.get(week.data) ?? [];
		events.push({ ...event.data, kind: inferKind(event.data.title) });
		grouped.set(week.data, events);
	}
	return { grouped, skipped };
}
