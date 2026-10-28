import { z } from 'zod';
import { capitalizeFirst, inferKind } from '../../src/lib/kinds.ts';
import { isoDate, weekNumber } from '../../src/lib/server/domain/dates.ts';

export const login = (value: string) => z.string().trim().min(1).parse(value).toLowerCase();
export const attended = (value: unknown) => value === 1 || value === '1' || value === true;
export function jsonValue(value: string | null): unknown {
	if (value === null) return null;
	try {
		return JSON.parse(value);
	} catch {
		return { legacy: value };
	}
}
const clock = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/Rome',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});
export function legacyTimestamp(value: string): string {
	const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/.exec(value);
	if (!match) throw new Error(`Invalid legacy timestamp: ${value}`);
	isoDate.parse(match[1]);
	z.iso.time().parse(match[2]);
	const wall = Date.parse(
		`${match[1]}T${match[2]}.${(match[3] ?? '').padEnd(3, '0').slice(0, 3)}Z`
	);
	// Earliest instant matches Python fold=0 when the autumn clock repeats.
	for (const offset of [120, 60]) {
		const instant = new Date(wall - offset * 60000);
		const p = Object.fromEntries(clock.formatToParts(instant).map((p) => [p.type, p.value]));
		if (
			`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}` ===
			`${match[1]} ${match[2]}`
		)
			return instant.toISOString().replace(/\d{3}Z$/, `${(match[3] ?? '').padEnd(6, '0')}Z`);
	}
	// Python fold=0 uses the pre-transition offset in the spring gap.
	return new Date(wall - 60 * 60000)
		.toISOString()
		.replace(/\d{3}Z$/, `${(match[3] ?? '').padEnd(6, '0')}Z`);
}
export function normalizeTime(value: string): string {
	const match = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(value);
	if (!match) throw new Error(`Invalid legacy time: ${value}`);
	const result = `${match[1].padStart(2, '0')}:${match[2]}`;
	z.iso.time({ precision: -1 }).parse(result);
	return result;
}
const days = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
const nullableText = z.string().nullable();
const id = z.number().int().positive();
export const legacySchemas = {
	users: z.object({
		id,
		intra_id: id,
		login: z.string(),
		email: nullableText,
		display_name: nullableText,
		image_url: nullableText,
		wallet: z.number().int(),
		is_admin: z.union([z.number(), z.boolean()]),
		created_at: z.string()
	}),
	settings: z.object({ key: z.string(), value: z.string() }),
	events: z.object({
		id,
		title: z.string(),
		description: nullableText,
		day: z.string(),
		event_date: nullableText,
		start_time: z.string(),
		end_time: z.string(),
		max_slots: z.number().int(),
		compensation: z.number().int().nonnegative(),
		week: weekNumber,
		registered: z.number().int()
	}),
	registrations: z.object({
		id,
		event_id: id,
		participant_name: z.string(),
		registration_date: z.string(),
		attended: z.unknown()
	}),
	week_templates: z.object({
		id,
		name: z.string().min(1).max(120),
		description: nullableText,
		target_week: weekNumber,
		created_at: z.string()
	}),
	template_events: z.object({
		id,
		template_id: id,
		title: z.string(),
		description: nullableText,
		day: z.string(),
		event_date: nullableText,
		start_time: z.string(),
		end_time: z.string(),
		max_slots: z.number().int(),
		compensation: z.number().int().nonnegative()
	}),
	baywatcher_whitelist: z.object({ id, intra_login: z.string(), added_at: z.string() }),
	action_logs: z.object({
		id,
		timestamp: z.string(),
		user_id: z.number().int(),
		username: z.string(),
		action_type: z.string(),
		action_description: nullableText,
		ip_address: nullableText,
		user_agent: nullableText,
		resource_id: nullableText,
		resource_type: nullableText,
		old_value: nullableText,
		new_value: nullableText
	})
};
export type LegacyRows = {
	[K in keyof typeof legacySchemas]: z.infer<(typeof legacySchemas)[K]>[];
};
export type LegacyEvent = LegacyRows['template_events'][number];
export function normalizeEvent(
	row: Omit<LegacyEvent, 'template_id'>,
	anomaly: (message: string) => void
) {
	const weekday =
		days.indexOf(
			row.day
				.trim()
				.toLowerCase()
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '')
		) + 1;
	if (!weekday) {
		anomaly('unknown weekday');
		return null;
	}
	const start_time = normalizeTime(row.start_time),
		end_time = normalizeTime(row.end_time);
	if (end_time <= start_time) {
		anomaly('end time must follow start time');
		return null;
	}
	if (row.max_slots < 1) anomaly('max_slots clamped to 1');
	return {
		id: row.id,
		title: capitalizeFirst(z.string().min(1).max(120).parse(row.title)),
		description: capitalizeFirst(
			z
				.string()
				.max(500)
				.parse(row.description ?? '')
		),
		kind: inferKind(row.title),
		weekday,
		event_date: row.event_date === null ? null : isoDate.parse(row.event_date),
		start_time,
		end_time,
		max_slots: Math.max(1, row.max_slots),
		compensation: row.compensation
	};
}
