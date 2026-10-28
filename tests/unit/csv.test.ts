import { expect, it } from 'vitest';
import { parseTemplateCsv, readCsv, writeCsv } from '../../src/lib/server/domain/csv.ts';
const header = 'Week,Giorno,Orario,Tipo Evento,Compenso,Partecipanti,Data';
const bytes = (text: string) => new TextEncoder().encode(text);
it.each([',', ';'])(
	'parses %s, BOM, case and accents, optional fields and quoted values',
	(separator) => {
		const input =
			'\uFEFF' +
			[
				header,
				'1,LUNEDÌ, 09:00 - 10:00 ,Esami,200,2,2026-10-26',
				'4,Domenica,22:00-23:00,"Titolo, con ""virgolette""",0,1,'
			]
				.map((line) => (separator === ',' ? line : line.replaceAll(',', ';')))
				.join('\r\n');
		const result = parseTemplateCsv(bytes(input));
		expect(result.skipped).toEqual([]);
		expect(result.grouped.get(1)?.[0]).toMatchObject({
			weekday: 1,
			kind: 'exam',
			startTime: '09:00',
			compensation: 200,
			maxSlots: 2
		});
		expect(result.grouped.get(4)?.[0]).toMatchObject({ weekday: 7 });
	}
);
it('falls back to latin-1 and defaults compensation and slots', () => {
	const result = parseTemplateCsv(
		Buffer.from('Week;Giorno;Orario;Tipo Evento\n2;Martedì;09:00-10:00;Caffè', 'latin1')
	);
	expect(result.grouped.get(2)?.[0]).toMatchObject({
		weekday: 2,
		title: 'Caffè',
		compensation: 0,
		maxSlots: 1
	});
});
it('ignores Date and supports multiline quoted fields', () => {
	const result = parseTemplateCsv(
		bytes('Week,Giorno,Orario,Tipo Evento,Date\n1,Lunedi,09:00-10:00,"Prima\nseconda",2026-10-26')
	);
	expect(result.grouped.get(1)?.[0]).toMatchObject({
		title: 'Prima\nseconda'
	});
});
it.each([
	'0,Lunedi,09:00-10:00,Title,0,1,',
	'5,Lunedi,09:00-10:00,Title,0,1,',
	',Lunedi,09:00-10:00,Title,0,1,',
	'1,,09:00-10:00,Title,0,1,',
	'1,Monday,09:00-10:00,Title,0,1,',
	'1,Lunedi,,Title,0,1,',
	'1,Lunedi,09:00-10:00,,0,1,',
	'1,Lunedi,09:00,Title,0,1,',
	'1,Lunedi,25:00-26:00,Title,0,1,',
	'1,Lunedi,10:00-09:00,Title,0,1,',
	'1,Lunedi,10:00-10:00,Title,0,1,',
	'1,Lunedi,09:00-10:00,Title,-1,1,',
	'1,Lunedi,09:00-10:00,Title,1.2,1,',
	'1,Lunedi,09:00-10:00,Title,0,0,',
	'1,Lunedi,09:00-10:00,Title,0,1e0,'
])('skips invalid rows and retains their source line: %s', (row) => {
	const result = parseTemplateCsv(bytes(header + '\n' + row + '\n1,Lunedi,09:00-10:00,Valid,0,1,'));
	expect(result.skipped).toEqual([2]);
	expect(result.grouped.get(1)).toHaveLength(1);
});
it('rejects oversized files, more than 2000 rows, and unclosed quotes', () => {
	expect(() => parseTemplateCsv(new Uint8Array(1024 * 1024 + 1))).toThrow();
	expect(() =>
		parseTemplateCsv(bytes(header + '\n' + '1,Lunedi,09:00-10:00,Title,0,1,\n'.repeat(2001)))
	).toThrow();
	expect(() => parseTemplateCsv(bytes(header + '\n1,Lunedi,09:00-10:00,"Unclosed'))).toThrow();
});
it('writes exact CSV escaping commas, quotes, newlines and nulls', () => {
	expect(
		writeCsv([
			['one', 'two'],
			['a,b', '"quoted"'],
			['a\nb', null],
			[1, 0]
		])
	).toBe('one,two\n"a,b","""quoted"""\n"a\nb",\n1,0\n');
});

it.each(['=1+1', '+SUM(A1)', '-2', '@cmd'])('neutralizes spreadsheet formula %s', (value) => {
	expect(writeCsv([[value]])).toBe("'" + value + '\n');
});
it('quotes neutralized formulas and preserves CRLF inside a cell', () => {
	expect(writeCsv([['=SUM(1,2)', 'line\r\nbreak']], '\r\n')).toBe(
		'"\'=SUM(1,2)","line\r\nbreak"\r\n'
	);
});

it.each(['Data', 'Date'])(
	'ignores %s even when the date is invalid or from an old pool',
	(column) => {
		const result = parseTemplateCsv(
			bytes(
				`Week,Giorno,Orario,Tipo Evento,${column}\n1,Lunedi,09:00-10:00,Esami,invalid\n1,Lunedi,10:00-11:00,Cluster,2000-01-01`
			)
		);
		expect(result.skipped).toEqual([]);
		expect(result.grouped.get(1)).toHaveLength(2);
	}
);

it.each(['=1+1', '+SUM(A1)', '-2', '@cmd', '\t=1+1', '\r=1+1'])(
	'neutralizes formulas at the start and after semicolons: %j',
	(value) => {
		const csv = writeCsv([[value, `x;${value};`]]);
		expect(readCsv(csv, ',')[0].cells).toEqual([`'${value}`, `x;'${value};`]);
		for (const separator of [',', ';']) {
			for (const { cells } of readCsv(csv, separator))
				for (const cell of cells) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
			for (const cell of csv.trimEnd().split(separator)) expect(cell).not.toMatch(/^[=+\-@\t\r]/);
		}
	}
);
it('quotes semicolons and tabs, including a formula injected in a User-Agent', () => {
	expect(writeCsv([['x;=1+1;', 'a\tb']])).toBe('"x;\'=1+1;","a\tb"\n');
});
