import type Database from 'better-sqlite3';
import { z } from 'zod';
import { setPoolDates } from '../../src/lib/server/domain/dates.ts';
import {
	attended,
	jsonValue,
	legacySchemas,
	legacyTimestamp,
	login,
	normalizeEvent,
	type LegacyRows
} from './normalize.ts';

export function readLegacy(db: Database.Database): LegacyRows {
	return Object.fromEntries(
		Object.entries(legacySchemas).map(([table, schema]) => [
			table,
			z
				.array(schema)
				.parse(
					db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'settings' ? 'key' : 'id'}`).all()
				)
		])
	) as LegacyRows;
}
export function prepareImport(source: LegacyRows, ignored: Record<string, number> = {}) {
	const anomalies: { table: string; id: number; reason: string }[] = [];
	const anomaly = (table: string, id: number) => (reason: string) =>
		anomalies.push({ table, id, reason });
	const users = source.users.map((r) => ({
		id: r.id,
		intra_id: r.intra_id,
		login: login(r.login),
		email: r.email,
		display_name: r.display_name,
		image_url: r.image_url,
		wallet: r.wallet,
		role: r.is_admin ? 'admin' : 'user',
		created_at: legacyTimestamp(r.created_at)
	}));
	const values = Object.fromEntries(source.settings.map((r) => [r.key, r.value]));
	const week = z.coerce.number().int().min(1).max(4),
		limit = z.coerce.number().int().min(0).max(32767);
	const dates = values.pool_start
		? setPoolDates(values.pool_start, values.pool_end || undefined)
		: { poolStart: null, poolEnd: null };
	const settings = {
		id: 1,
		pool_start: dates.poolStart,
		pool_end: dates.poolEnd,
		active_week: week.parse(values.active_week ?? 1),
		display_week: week.parse(values.display_week ?? 1),
		max_events_per_user: limit.parse(values.max_events_per_user ?? 0)
	};
	const events = source.events.flatMap((r) => {
		const event = normalizeEvent(r, anomaly('events', r.id));
		return event ? [{ ...event, week: r.week }] : [];
	});
	const eventIds = new Set(events.map((r) => r.id));
	const seen = new Set<string>();
	const registrations = [...source.registrations]
		.sort(
			(a, b) =>
				legacyTimestamp(a.registration_date).localeCompare(legacyTimestamp(b.registration_date)) ||
				a.id - b.id
		)
		.flatMap((r) => {
			if (!eventIds.has(r.event_id)) {
				anomaly('registrations', r.id)('missing or skipped event');
				return [];
			}
			const participant_login = login(r.participant_name),
				key = `${r.event_id}:${participant_login}`;
			if (seen.has(key)) {
				anomaly('registrations', r.id)('duplicate event/login; oldest retained');
				return [];
			}
			seen.add(key);
			return [
				{
					id: r.id,
					event_id: r.event_id,
					participant_login,
					attended: attended(r.attended),
					registered_at: legacyTimestamp(r.registration_date)
				}
			];
		});
	const week_templates = source.week_templates.map((r) => ({
		...r,
		description: r.description ?? '',
		created_at: legacyTimestamp(r.created_at)
	}));
	const template_events = source.template_events.flatMap((r) => {
		const event = normalizeEvent({ ...r, event_date: null }, anomaly('template_events', r.id));
		if (!event) return [];
		return [
			{
				id: event.id,
				template_id: r.template_id,
				title: event.title,
				description: event.description,
				kind: event.kind,
				weekday: event.weekday,
				start_time: event.start_time,
				end_time: event.end_time,
				max_slots: event.max_slots,
				compensation: event.compensation
			}
		];
	});
	const whitelistSeen = new Set<string>();
	const whitelist = source.baywatcher_whitelist.flatMap((r) => {
		const normalized = login(r.intra_login);
		if (whitelistSeen.has(normalized)) {
			anomaly('baywatcher_whitelist', r.id)('duplicate login');
			return [];
		}
		whitelistSeen.add(normalized);
		return [{ id: r.id, login: normalized, added_at: legacyTimestamp(r.added_at) }];
	});
	const userIds = new Map(users.map((r) => [r.intra_id, r.id]));
	const action_logs = source.action_logs.map((r) => ({
		id: r.id,
		created_at: legacyTimestamp(r.timestamp),
		actor_user_id: userIds.get(r.user_id) ?? null,
		actor_login: login(r.username),
		action_type: r.action_type,
		description: r.action_description ?? '',
		ip_address: r.ip_address,
		user_agent: r.user_agent?.slice(0, 200) ?? null,
		resource_type: r.resource_type,
		resource_id: r.resource_id,
		old_value: jsonValue(r.old_value),
		new_value: jsonValue(r.new_value)
	}));
	const data = {
		users,
		events,
		registrations,
		week_templates,
		template_events,
		whitelist,
		action_logs
	};
	const tables = Object.fromEntries(
		Object.entries(source).map(([table, rows]) => {
			const imported =
				table === 'settings'
					? 1
					: data[table === 'baywatcher_whitelist' ? 'whitelist' : (table as keyof typeof data)]
							.length;
			return [
				table,
				{ read: rows.length, imported, skipped: table === 'settings' ? 0 : rows.length - imported }
			];
		})
	);
	for (const [table, count] of Object.entries(ignored))
		tables[table] = { read: count, imported: 0, skipped: count };
	return { data, settings, report: { tables, anomalies } };
}
export type ImportData = ReturnType<typeof prepareImport>;
