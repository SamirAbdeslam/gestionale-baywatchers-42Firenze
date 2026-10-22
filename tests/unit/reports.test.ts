import { expect, it } from 'vitest';
import {
	eventHours,
	participantTotals,
	summaryCsv,
	detailedCsv,
	participantCsv,
	type ParticipantReport
} from '../../src/lib/server/domain/reports.ts';
const registeredAt = new Date('2026-10-22T07:00:00Z');
const report: ParticipantReport[] = [
	{
		login: 'alpha',
		events: 1,
		hours: 1.5,
		altarian: 200,
		weeks: [
			{
				week: 1,
				events: [
					{
						title: 'Esami, "A"',
						week: 1,
						weekday: 1,
						date: '2026-10-26',
						startTime: '09:00',
						endTime: '10:30',
						duration: 1.5,
						compensation: 200,
						attended: true,
						registeredAt
					},
					{
						title: 'Assente',
						week: 1,
						weekday: 7,
						date: null,
						startTime: '10:00',
						endTime: '10:20',
						duration: 0.33,
						compensation: 100,
						attended: false,
						registeredAt
					}
				]
			}
		]
	}
];
it('calculates minute durations and rounds only the total of attended time', () => {
	expect(eventHours('09:00:00', '10:30:00')).toBe(1.5);
	expect(eventHours('09:00', '09:20')).toBe(0.33);
	expect(
		participantTotals(
			Array.from({ length: 3 }, () => ({
				participantLogin: 'alpha',
				attended: true,
				startTime: '09:00',
				endTime: '09:20',
				compensation: 10
			}))
		)
	).toEqual([{ login: 'alpha', events: 3, hours: 1, altarian: 30 }]);
	expect(
		participantTotals([
			{
				participantLogin: 'absent',
				attended: false,
				startTime: '09:00',
				endTime: '10:00',
				compensation: 100
			}
		])
	).toEqual([{ login: 'absent', events: 0, hours: 0, altarian: 0 }]);
});
it('writes the exact summary including legacy heading and unpadded decimals', () => {
	expect(summaryCsv(report)).toBe(
		'Nome Partecipante,Eventi Iscritti,Ore Totali,Altarian Totale\r\nalpha,1,1.5,200\r\n'
	);
});
it('writes the exact detailed report including absent events, null dates and escaped quotes', () => {
	expect(detailedCsv(report)).toBe(
		'Nome Partecipante,Eventi Partecipati,Numero Eventi,Totale Ore,Totale Altarian\r\nalpha,"Esami, ""A"" (Lunedì 26/10/2026, 1.5h, 200₳) | Assente (Domenica , 0.33h, NON PARTECIPATO)",1,1.5,200\r\n'
	);
});
it('writes the exact personal CSV with zero compensation for absences and Rome registration dates', () => {
	expect(participantCsv(report)).toBe(
		'Titolo Evento,Giorno,Orario Inizio,Orario Fine,Durata (ore),Altarian,Stato,Data Iscrizione\r\n"Esami, ""A""",Lunedì,09:00,10:30,1.5,200,PARTECIPATO,2026-10-22 09:00:00\r\nAssente,Domenica,10:00,10:20,0.33,0,NON PARTECIPATO,2026-10-22 09:00:00\r\n'
	);
});
it('writes header-only exports when there are no participants', () => {
	expect(summaryCsv([])).toBe('Nome Partecipante,Eventi Iscritti,Ore Totali,Altarian Totale\r\n');
	expect(detailedCsv([])).toBe(
		'Nome Partecipante,Eventi Partecipati,Numero Eventi,Totale Ore,Totale Altarian\r\n'
	);
	expect(participantCsv([])).toBe(
		'Titolo Evento,Giorno,Orario Inizio,Orario Fine,Durata (ore),Altarian,Stato,Data Iscrizione\r\n'
	);
});
