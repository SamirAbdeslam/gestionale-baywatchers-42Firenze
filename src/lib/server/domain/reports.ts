import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import type { User } from '../auth/session.ts';
import { assertAdmin, loginPattern } from '../auth/guards.ts';
import { events, registrations, settings } from '../db/schema.ts';
import { concreteDate } from './dates.ts';
import { writeCsv } from './csv.ts';

export type AttendanceRow = {
	participantLogin: string;
	attended: boolean;
	startTime: string;
	endTime: string;
	compensation: number;
};

function durationMinutes(start: string, end: string) {
	const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
	return minutes(end) - minutes(start);
}
export function eventHours(start: string, end: string) {
	return Number((durationMinutes(start, end) / 60).toFixed(2));
}

export function participantTotals(rows: AttendanceRow[]) {
	const totals = new Map<
		string,
		{ login: string; events: number; minutes: number; altarian: number }
	>();
	for (const row of rows) {
		const total = totals.get(row.participantLogin) ?? {
			login: row.participantLogin,
			events: 0,
			minutes: 0,
			altarian: 0
		};
		if (row.attended) {
			total.events++;
			total.minutes += durationMinutes(row.startTime, row.endTime);
			total.altarian += row.compensation;
		}
		totals.set(row.participantLogin, total);
	}
	return [...totals.values()]
		.sort((a, b) => a.login.localeCompare(b.login))
		.map(({ minutes, ...total }) => ({ ...total, hours: Number((minutes / 60).toFixed(2)) }));
}

export type ReportEvent = {
	title: string;
	week: number;
	weekday: number;
	date: string | null;
	startTime: string;
	endTime: string;
	duration: number;
	compensation: number;
	attended: boolean;
	registeredAt: Date;
};
export type ParticipantReport = ReturnType<typeof participantTotals>[number] & {
	weeks: { week: number; events: ReportEvent[] }[];
};

export async function getParticipants(
	database: typeof db,
	actor: User | null,
	input?: unknown
): Promise<ParticipantReport[]> {
	assertAdmin(actor);
	const login = z.string().regex(loginPattern).optional().parse(input);
	const [config] = await database
		.select({ poolStart: settings.poolStart })
		.from(settings)
		.where(eq(settings.id, 1));
	if (!config) throw new Error('Settings row is missing');
	const rows = await database
		.select({
			participantLogin: registrations.participantLogin,
			attended: registrations.attended,
			registeredAt: registrations.registeredAt,
			title: events.title,
			week: events.week,
			weekday: events.weekday,
			eventDate: events.eventDate,
			startTime: events.startTime,
			endTime: events.endTime,
			compensation: events.compensation
		})
		.from(registrations)
		.innerJoin(events, eq(events.id, registrations.eventId))
		.where(login === undefined ? undefined : eq(registrations.participantLogin, login))
		.orderBy(
			registrations.participantLogin,
			events.week,
			events.weekday,
			events.startTime,
			events.id
		);
	const grouped = new Map<string, Map<number, ReportEvent[]>>();
	for (const row of rows) {
		const weeks = grouped.get(row.participantLogin) ?? new Map<number, ReportEvent[]>();
		const entries = weeks.get(row.week) ?? [];
		entries.push({
			title: row.title,
			week: row.week,
			weekday: row.weekday,
			date: concreteDate(row, config.poolStart),
			startTime: row.startTime.slice(0, 5),
			endTime: row.endTime.slice(0, 5),
			duration: eventHours(row.startTime, row.endTime),
			compensation: row.compensation,
			attended: row.attended,
			registeredAt: row.registeredAt
		});
		weeks.set(row.week, entries);
		grouped.set(row.participantLogin, weeks);
	}
	return participantTotals(rows).map((total) => ({
		...total,
		weeks: [...grouped.get(total.login)!].map(([week, events]) => ({ week, events }))
	}));
}

// Administrative CSV labels remain Italian regardless of the UI locale.
const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const clock = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Rome',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});
export function summaryCsv(participants: ParticipantReport[]) {
	return writeCsv(
		[
			['Nome Partecipante', 'Eventi Iscritti', 'Ore Totali', 'Altarian Totale'],
			...participants.map((p) => [p.login, p.events, p.hours, p.altarian])
		],
		'\r\n'
	);
}
export function detailedCsv(participants: ParticipantReport[]) {
	return writeCsv(
		[
			['Nome Partecipante', 'Eventi Partecipati', 'Numero Eventi', 'Totale Ore', 'Totale Altarian'],
			...participants.map((p) => [
				p.login,
				p.weeks
					.flatMap((week) => week.events)
					.map(
						(event) =>
							`${event.title} (${days[event.weekday - 1]} ${event.date?.split('-').reverse().join('/') ?? ''}, ${event.duration}h, ${event.attended ? `${event.compensation}₳` : 'NON PARTECIPATO'})`
					)
					.join(' | '),
				p.events,
				p.hours,
				p.altarian
			])
		],
		'\r\n'
	);
}
export function participantCsv(participants: ParticipantReport[]) {
	return writeCsv(
		[
			[
				'Titolo Evento',
				'Giorno',
				'Orario Inizio',
				'Orario Fine',
				'Durata (ore)',
				'Altarian',
				'Stato',
				'Data Iscrizione'
			],
			...participants
				.flatMap((p) => p.weeks.flatMap((week) => week.events))
				.map((event) => [
					event.title,
					days[event.weekday - 1],
					event.startTime,
					event.endTime,
					event.duration,
					event.attended ? event.compensation : 0,
					event.attended ? 'PARTECIPATO' : 'NON PARTECIPATO',
					clock.format(event.registeredAt)
				])
		],
		'\r\n'
	);
}
