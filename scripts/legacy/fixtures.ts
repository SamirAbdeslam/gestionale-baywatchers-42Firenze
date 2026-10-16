import { faker } from '@faker-js/faker';
import { PRESETS } from '../../src/lib/server/domain/kinds.ts';
import { addDays } from '../../src/lib/server/domain/dates.ts';
import type { LegacyRows } from './normalize.ts';

export const ACTION_TYPES = [
	'CREATE_EVENT',
	'UPDATE_EVENT',
	'DELETE_EVENT',
	'DELETE_DAY_EVENTS',
	'DELETE_WEEK_EVENTS',
	'DELETE_ALL_EVENTS',
	'REGISTER_EVENT',
	'UNREGISTER_EVENT',
	'ADMIN_UNREGISTER',
	'ADMIN_ADD_PARTICIPANT',
	'MARK_PRESENT',
	'MARK_ABSENT',
	'ACTIVATE_WEEK',
	'UPDATE_SETTING',
	'CREATE_TEMPLATE',
	'APPLY_TEMPLATE',
	'DELETE_TEMPLATE',
	'IMPORT_TEMPLATES',
	'WHITELIST_ADD',
	'WHITELIST_REMOVE',
	'LOGIN'
] as const;
export const LEGACY_DAYS = [
	'Lunedì',
	'Martedì',
	'Mercoledì',
	'Giovedì',
	'Venerdì',
	'Sabato',
	'Domenica'
];
export function makeRows(seed = 42, poolStart = '2026-10-12'): LegacyRows {
	faker.seed(seed);
	const stamp = '2026-10-01 10:20:30.123456';
	const users = Array.from({ length: 60 }, (_, i) => ({
		id: i + 1,
		intra_id: 10000 + i,
		login: `${faker.person
			.firstName()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[^a-z]/g, '')
			.slice(0, 7)}${i}`,
		email: `student${i}@example.test`,
		display_name: faker.person.fullName(),
		image_url: null,
		wallet: faker.number.int({ min: 0, max: 2000 }),
		is_admin: i < 3 ? 1 : 0,
		created_at: stamp
	}));
	const presets = [
		...Object.values(PRESETS),
		{ title: 'Supporto laboratorio', description: 'Attività personalizzata', compensation: 75 }
	];
	const events: LegacyRows['events'] = Array.from({ length: 60 }, (_, i) => {
		const weekday = i % 7;
		const week = Math.floor(i / 15) + 1;
		return {
			id: i + 1,
			...presets[i % presets.length],
			day: LEGACY_DAYS[weekday],
			event_date: i % 5 === 0 ? addDays(poolStart, (week - 1) * 7 + weekday) : null,
			start_time: i === 0 ? '9:00' : `${String(9 + (i % 5)).padStart(2, '0')}:00`,
			end_time: `${String(11 + (i % 5)).padStart(2, '0')}:00`,
			max_slots: 10,
			registered: i < 3 ? 99 : 6,
			week
		};
	});
	const registrations: LegacyRows['registrations'] = events.flatMap((event, i) =>
		Array.from({ length: 6 }, (_, j) => ({
			id: i * 6 + j + 1,
			event_id: event.id,
			participant_name: i === 0 && j < 3 ? `external${j}` : users[(i * 6 + j) % users.length].login,
			registration_date: stamp,
			attended: (i * 6 + j) % 10 === 0 ? 0 : 1
		}))
	);
	registrations[3].participant_name = registrations[3].participant_name.toUpperCase();
	for (let i = 0; i < 2; i++)
		registrations.push({
			...registrations[i],
			id: 361 + i,
			registration_date: '2026-10-02 10:20:30.000000'
		});
	const week_templates = Array.from({ length: 3 }, (_, i) => ({
		id: i + 1,
		name: `Settimana ${i + 1}`,
		description: 'Template di sviluppo',
		target_week: i + 1,
		created_at: stamp
	}));
	const template_events = week_templates.flatMap((template) =>
		events.slice(0, 7).map((event, i) => ({
			id: (template.id - 1) * 7 + i + 1,
			template_id: template.id,
			title: event.title,
			description: event.description,
			day: event.day,
			event_date: event.event_date,
			start_time: event.start_time,
			end_time: event.end_time,
			max_slots: event.max_slots,
			compensation: event.compensation
		}))
	);
	return {
		users,
		settings: Object.entries({
			active_week: '2',
			display_week: '2',
			max_events_per_user: '3',
			pool_start: poolStart,
			pool_end: addDays(poolStart, 27)
		}).map(([key, value]) => ({ key, value })),
		events,
		registrations,
		week_templates,
		template_events,
		baywatcher_whitelist: users
			.slice(0, 40)
			.map((user, i) => ({ id: i + 1, intra_login: user.login, added_at: stamp })),
		action_logs: Array.from({ length: 500 }, (_, i) => ({
			id: i + 1,
			timestamp: `2026-10-${String(1 + (i % 10)).padStart(2, '0')} 10:20:30.123456`,
			user_id: users[i % 60].intra_id,
			username: users[i % 60].login,
			action_type: ACTION_TYPES[i % ACTION_TYPES.length],
			action_description: `Operazione di sviluppo ${i + 1}`,
			ip_address: '127.0.0.1',
			user_agent: 'Fixture browser',
			resource_id: String((i % 60) + 1),
			resource_type: 'event',
			old_value: [null, '{"title":"Prima"}', "(5, 'Icebreaker')"][i % 3],
			new_value: [null, '{"title":"Dopo"}', "{'title': 'x'}"][i % 3]
		}))
	};
}
