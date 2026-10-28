import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createIcs, eventTimes, googleCalendarUrl } from '../../src/lib/server/domain/ics.ts';

beforeAll(() => vi.stubEnv('TZ', 'Europe/Rome'));
afterAll(() => vi.unstubAllEnvs());
const event = {
	id: 42,
	title: 'Evento, prova; test',
	description: 'Prima riga\nSeconda riga',
	startTime: '09:00:00',
	endTime: '11:00:00'
};
const now = new Date('2026-10-21T10:00:00Z');
it('creates a single Rome event with stable UID, UTC stamp and three display alarms', () => {
	const text = createIcs(event, '2027-01-02', now).replace(/\r\n /g, '');
	expect(text).toContain('PRODID:-//GestionaleBaywatchers//42Firenze//IT');
	expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
	expect(text).toContain('DTSTART;TZID=Europe/Rome:20270102T090000');
	expect(text).toContain('DTEND;TZID=Europe/Rome:20270102T110000');
	expect(text).toContain('DTSTAMP:20261021T100000Z');
	expect(text).toContain('UID:event-42-2027-01-02T08:00:00.000Z@baywatchers.42firenze.it');
	expect(text).toContain('LOCATION:42 Firenze');
	expect(text).toContain('SUMMARY:Evento\\, prova\\; test');
	expect(text).toContain('DESCRIPTION:Prima riga\\nSeconda riga');
	expect(text.match(/BEGIN:VALARM/g)).toHaveLength(3);
	expect(text.match(/ACTION:DISPLAY/g)).toHaveLength(3);
	for (const trigger of ['-P1D', '-PT2H', '-PT1H']) expect(text).toContain(`TRIGGER:${trigger}`);
	expect(text.match(/DESCRIPTION:Ricorda:/g)).toHaveLength(3);
});
it.each([
	['2027-01-02', '09:00', '11:00', '2027-01-02T08:00:00.000Z', '2027-01-02T10:00:00.000Z'],
	['2027-07-02', '09:00', '11:00', '2027-07-02T07:00:00.000Z', '2027-07-02T09:00:00.000Z'],
	['2026-03-29', '01:30', '03:30', '2026-03-29T00:30:00.000Z', '2026-03-29T01:30:00.000Z'],
	['2026-10-25', '01:30', '03:30', '2026-10-24T23:30:00.000Z', '2026-10-25T02:30:00.000Z']
])(
	'converts Rome times in winter, summer and across clock changes (%s)',
	(date, startTime, endTime, start, end) => {
		const result = eventTimes(date, { startTime, endTime });
		expect(result.start.toISOString()).toBe(start);
		expect(result.end.toISOString()).toBe(end);
	}
);
it('builds encoded Google links in UTC, with fallback details and no link when date is unset', () => {
	const value = { ...event, title: '<img> & titolo', description: '' };
	const url = new URL(googleCalendarUrl(value, '2027-07-02')!);
	expect(url.origin + url.pathname).toBe('https://www.google.com/calendar/render');
	expect(Object.fromEntries(url.searchParams)).toEqual({
		action: 'TEMPLATE',
		text: value.title,
		dates: '20270702T070000Z/20270702T090000Z',
		details: `Evento Baywatcher: ${value.title}`,
		location: '42 Firenze',
		ctz: 'Europe/Rome'
	});
	expect(googleCalendarUrl(value, null)).toBeNull();
});
it('escapes content so newlines cannot inject extra calendar properties or components', () => {
	const text = createIcs(
		{ ...event, title: 'Title\r\nBEGIN:VEVENT', description: 'a\\b\nATTENDEE:bad' },
		'2027-01-02',
		now
	);
	expect(text.match(/^BEGIN:VEVENT\r?$/gm)).toHaveLength(1);
	expect(text).not.toMatch(/^ATTENDEE:/m);
});
