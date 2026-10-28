import { expect, it } from 'vitest';
import {
	ARCHIVE_COLUMNS,
	archiveCsv,
	parseArchiveCsv
} from '../../src/lib/server/domain/archive.ts';
import { writeCsv } from '../../src/lib/server/domain/csv.ts';
import type { PoolEntry } from '../../src/lib/server/domain/pool.ts';

const entry = (over: Partial<PoolEntry> = {}): PoolEntry => ({
	login: 'student',
	title: 'Exam, "quoted"\nsecond line',
	kind: 'exam',
	eventDate: '2025-05-05',
	weekday: 1,
	startTime: '09:00:00',
	endTime: '10:30:00',
	durationMinutes: 90,
	compensation: 200,
	attended: true,
	registeredAt: new Date('2025-05-01T08:00:00.123Z'),
	week: 1,
	maxSlots: 4,
	eventRef: 7,
	weekActivatedAt: new Date('2025-05-01T07:59:00.000Z'),
	...over
});
const bytes = (rows: (string | number | null)[][]) =>
	new TextEncoder().encode(writeCsv([[...ARCHIVE_COLUMNS], ...rows]));
const valid = [
	'student',
	'Exam',
	'exam',
	'2025-05-05',
	1,
	'09:00',
	'10:00',
	60,
	10,
	'true',
	'2025-05-01T08:00:00Z',
	1,
	4,
	7,
	'2025-05-01T07:59:00Z'
];

it('uses a fixed English header and formats dates, times, booleans and nulls', () => {
	const [header, row, nulls] = archiveCsv([
		entry({ title: 'Plain' }),
		entry({
			title: '=cmd',
			eventDate: null,
			weekday: null,
			startTime: null,
			endTime: null,
			attended: false,
			registeredAt: null,
			week: null,
			maxSlots: null,
			eventRef: null,
			weekActivatedAt: null
		})
	]).split('\n');
	expect(header).toBe(
		'login,title,kind,event_date,weekday,start_time,end_time,duration_minutes,compensation,attended,registered_at,week,max_slots,event_ref,week_activated_at'
	);
	expect(row).toBe(
		'student,Plain,exam,2025-05-05,1,09:00,10:30,90,200,true,2025-05-01T08:00:00.123Z,1,4,7,2025-05-01T07:59:00.000Z'
	);
	expect(nulls).toBe("student,'=cmd,exam,,,,,90,200,false,,,,,");
});

it('round-trips export to import with identical rows', () => {
	const rows = [
		entry(),
		entry({
			login: 'other',
			eventDate: null,
			weekday: null,
			startTime: null,
			endTime: null,
			week: null,
			maxSlots: null,
			eventRef: null,
			registeredAt: null,
			weekActivatedAt: null,
			attended: false
		})
	];
	const result = parseArchiveCsv(new TextEncoder().encode(archiveCsv(rows)));
	expect(result.skipped).toEqual([]);
	expect(result.entries).toEqual(
		rows.map((row) => ({
			...row,
			startTime: row.startTime?.slice(0, 5) ?? null,
			endTime: row.endTime?.slice(0, 5) ?? null
		}))
	);
});

it('round-trips titles and logins that writeCsv protects against formulas', () => {
	const rows = [
		'-Corso C',
		'=sum',
		'@home',
		'+1',
		'x;=1+1;',
		"x;'=1+1;''@home",
		"'=sum",
		'x;+1;-2;@cmd',
		'\t=1',
		'\r=1',
		'x;\t=1;\r=1'
	].map((title) => entry({ title, login: '-x' }));
	const result = parseArchiveCsv(new TextEncoder().encode(archiveCsv(rows)));
	expect(result.skipped).toEqual([]);
	expect(result.entries.map((row) => [row.login, row.title])).toEqual(
		rows.map((row) => [row.login, row.title])
	);
});

it('rejects a wrong header and oversized input', () => {
	expect(() => parseArchiveCsv(new TextEncoder().encode('login,title\nx,y\n'))).toThrow();
	expect(() =>
		parseArchiveCsv(new TextEncoder().encode(archiveCsv([]).replace('login', 'user')))
	).toThrow();
});

it('skips invalid rows with the offending column and keeps valid ones', () => {
	const bad = (index: number, value: string | number) =>
		valid.map((cell, i) => (i === index ? value : cell));
	const result = parseArchiveCsv(
		bytes([
			valid,
			valid.slice(0, 5),
			bad(0, 'Bad Login'),
			bad(2, 'party'),
			bad(3, '2025-02-30'),
			bad(4, 9),
			bad(5, '25:00'),
			bad(9, 'yes'),
			bad(10, '2025-05-01'),
			bad(11, 5),
			bad(8, -1),
			bad(6, '08:00'),
			bad(4, 2),
			['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
		])
	);
	expect(result.rowsRead).toBe(13);
	expect(result.entries).toHaveLength(1);
	expect(result.skipped.map(({ line, reason, column }) => [line, reason, column])).toEqual([
		[3, 'archive_skip_columns', ''],
		[4, 'archive_skip_invalid', 'login'],
		[5, 'archive_skip_invalid', 'kind'],
		[6, 'archive_skip_invalid', 'event_date'],
		[7, 'archive_skip_invalid', 'weekday'],
		[8, 'archive_skip_invalid', 'start_time'],
		[9, 'archive_skip_invalid', 'attended'],
		[10, 'archive_skip_invalid', 'registered_at'],
		[11, 'archive_skip_invalid', 'week'],
		[12, 'archive_skip_invalid', 'compensation'],
		[13, 'archive_skip_invalid', 'end_time'],
		[14, 'archive_skip_invalid', 'weekday']
	]);
});

it('accepts a UTF-8 BOM and latin-1 bytes', () => {
	const text = writeCsv([[...ARCHIVE_COLUMNS], valid.map((c, i) => (i === 1 ? 'Caffè' : c))]);
	expect(
		parseArchiveCsv(new TextEncoder().encode(`${String.fromCharCode(0xfeff)}${text}`)).entries[0]
			.title
	).toBe('Caffè');
	expect(parseArchiveCsv(Buffer.from(text, 'latin1')).entries[0].title).toBe('Caffè');
});
