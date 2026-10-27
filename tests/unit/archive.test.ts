import { expect, it } from 'vitest';
import { parseDetailedCsv } from '../../src/lib/server/domain/archive.ts';
import { writeCsv } from '../../src/lib/server/domain/csv.ts';
import { detailedCsv, type ParticipantReport } from '../../src/lib/server/domain/reports.ts';

const header = [
	'Nome Partecipante',
	'Eventi Partecipati',
	'Numero Eventi',
	'Totale Ore',
	'Totale Altarian'
];
const bytes = (list: string, login = 'student') =>
	new TextEncoder().encode(writeCsv([header, [login, list, 0, 0, 0]]));

it('parses attended and absent entries, balanced parentheses, decimals and inferred kinds', () => {
	const result = parseDetailedCsv(
		bytes(
			'Esami (turno 1) (Lunedì 05/05/2025, 1.5h, 200₳) | Rush (Martedì 06/05/2025, 0.33h, NON PARTECIPATO)'
		)
	);
	expect(result.rowsRead).toBe(1);
	expect(result.skipped).toEqual([]);
	expect(result.entries).toEqual([
		{
			login: 'student',
			title: 'Esami (turno 1)',
			kind: 'exam',
			eventDate: '2025-05-05',
			weekday: 1,
			durationMinutes: 90,
			compensation: 200,
			attended: true,
			startTime: null,
			endTime: null,
			registeredAt: null
		},
		{
			login: 'student',
			title: 'Rush',
			kind: 'rush',
			eventDate: '2025-05-06',
			weekday: 2,
			durationMinutes: 20,
			compensation: 0,
			attended: false,
			startTime: null,
			endTime: null,
			registeredAt: null
		}
	]);
});

it('accepts UTF-8 BOM, multiline titles, commas and escaped quotes', () => {
	const data = bytes('Caffè, "ciao"\nparte 2 (Lunedì 05/05/2025, 1h, 0₳)');
	const result = parseDetailedCsv(Buffer.concat([Buffer.from('\uFEFF'), data]));
	expect(result.entries[0].title).toBe('Caffè, "ciao"\nparte 2');
	expect(result.skipped).toEqual([]);
});

it('decodes latin-1 without losing accents', () => {
	const text = writeCsv([
		header,
		['student', 'Caffè (Martedì 06/05/2025, 2h, NON PARTECIPATO)', 0, 0, 0]
	]);
	expect(parseDetailedCsv(Buffer.from(text, 'latin1')).entries[0]).toMatchObject({
		title: 'Caffè',
		weekday: 2,
		attended: false
	});
});

it('keeps unknown dates null and the known weekday without inventing times', () => {
	expect(parseDetailedCsv(bytes('Exam (Lunedì , 2h, 100₳)')).entries[0]).toMatchObject({
		eventDate: null,
		weekday: 1,
		startTime: null,
		endTime: null
	});
});

it.each([
	'Foo | Bar (Lunedì 05/05/2025, 1h, 10₳)',
	'Foo (note) | Bar (Lunedì 05/05/2025, 1h, 10₳)',
	'unreadable',
	'Exam (Lunedì 05/05/2025, -1h, 10₳)',
	'Exam (Lunedì 05/05/2025, 1h, -10₳)'
])('does not guess delimiters or malformed metadata: %s', (entry) => {
	const result = parseDetailedCsv(bytes(entry));
	expect(result.entries).toEqual([]);
	expect(result.skipped).toEqual([{ line: 2, value: entry, reason: 'archive_skip_ambiguous' }]);
});

it.each([
	'Foo (bar (Lunedì 05/05/2025, 1h, 10₳)',
	'Foo ) bar (Lunedì 05/05/2025, 1h, 10₳)',
	'Foo (Lunedì 05/05/2025, 1h, 10₳) (Lunedì 05/05/2025, 1h, 10₳)',
	'Exam (Lunedì 31/02/2025, 1h, 10₳)',
	'Exam (Martedì 05/05/2025, 1h, 10₳)',
	'Exam (Unknown 05/05/2025, 1h, 10₳)',
	'Exam (Lunedì 05/05/2025, 999999999h, 10₳)',
	'Exam (Lunedì 05/05/2025, 1h, 999999999999₳)'
])('skips an uncertain entry but retains another valid entry: %s', (entry) => {
	const result = parseDetailedCsv(bytes(entry + ' | Valid (Lunedì 05/05/2025, 1h, 0₳)'));
	expect(result.entries).toHaveLength(1);
	expect(result.entries[0].title).toBe('Valid');
	expect(result.skipped[0]).toMatchObject({ line: 2, reason: 'archive_skip_entry' });
});

it('skips invalid logins and wrong column counts with a reason and source line', () => {
	const csv = writeCsv([header, ['bad login', '', 0, 0, 0], ['student', 'missing columns']]);
	const result = parseDetailedCsv(Buffer.from(csv));
	expect(result.skipped.map(({ line, reason }) => ({ line, reason }))).toEqual([
		{ line: 2, reason: 'archive_skip_row' },
		{ line: 3, reason: 'archive_skip_row' }
	]);
});

it('supports an empty export and blank lines', () => {
	expect(parseDetailedCsv(Buffer.from(writeCsv([header]) + '\n'))).toEqual({
		entries: [],
		skipped: [],
		rowsRead: 0
	});
});

it('rejects a wrong header, broken quotes, empty and oversized files or too many rows', () => {
	for (const data of [
		Buffer.from('wrong\n'),
		Buffer.from(writeCsv([header]) + '"broken'),
		new Uint8Array(),
		new Uint8Array(1024 * 1024 + 1),
		Buffer.from(writeCsv([header]) + 'student,,0,0,0\n'.repeat(2001))
	])
		expect(() => parseDetailedCsv(data)).toThrow();
});

it('round-trips the actual detailedCsv writer including absences and partial dates', () => {
	const event = {
		title: 'Exam (practice)',
		week: 1,
		weekday: 1,
		date: '2025-05-05',
		startTime: '09:00',
		endTime: '10:00',
		duration: 1,
		compensation: 200,
		attended: true,
		passed: true,
		registeredAt: new Date('2025-05-01T00:00:00Z')
	};
	const report: ParticipantReport = {
		login: 'student',
		events: 1,
		hours: 1,
		altarian: 200,
		weeks: [{ week: 1, events: [event, { ...event, date: null, attended: false }] }]
	};
	const result = parseDetailedCsv(Buffer.from(detailedCsv([report])));
	expect(result.skipped).toEqual([]);
	expect(result.entries).toHaveLength(2);
	expect(result.entries[0]).toMatchObject({
		title: event.title,
		eventDate: event.date,
		durationMinutes: 60,
		compensation: 200
	});
	expect(result.entries[1]).toMatchObject({ eventDate: null, attended: false, compensation: 0 });
});
