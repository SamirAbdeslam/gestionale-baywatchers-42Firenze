import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	createEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents,
	listWeekEvents
} from '../../src/lib/server/domain/events.ts';
import { PRESETS } from '../../src/lib/kinds.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-19T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'events test' };
const input = {
	week: 2,
	weekday: 6,
	kind: 'custom',
	title: '  evento custom ',
	description: '',
	startTime: '09:00',
	endTime: '10:00',
	maxSlots: 2,
	compensation: 0,
	eventDate: ''
};
const changes = {
	title: '  evento modificato ',
	description: ' nuova descrizione ',
	weekday: 7,
	startTime: '11:00',
	endTime: '12:30',
	maxSlots: 1,
	compensation: 42
};
let actor: User, messages: RealtimeEvent[], unsubscribe: () => void;
const truncate = () =>
	client`TRUNCATE users, events, registrations, week_templates, template_events, whitelist, action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	[actor] = await database
		.insert(schema.users)
		.values({ intraId: 42, login: 'events_admin', role: 'admin' })
		.returning();
	messages = [];
	unsubscribe = subscribe((message) => messages.push(message));
});
afterEach(() => unsubscribe());
afterAll(async () => {
	await truncate();
	await client.end();
});
async function fixture(values: Partial<typeof schema.events.$inferInsert> = {}) {
	const [event] = await database
		.insert(schema.events)
		.values({
			...input,
			title: 'Fixture',
			description: '',
			eventDate: null,
			kind: 'custom',
			...values
		})
		.returning();
	await database.insert(schema.registrations).values([
		{ eventId: event.id, participantLogin: 'present', attended: true },
		{ eventId: event.id, participantLogin: 'absent', attended: false }
	]);
	return event;
}
it.each(Object.entries(PRESETS))(
	'creates preset %s from trusted values with exactly one audit and notification',
	async (kind, preset) => {
		const event = await createEvent(
			database,
			actor,
			{ ...input, kind, title: 'forged', description: 'forged', compensation: 999 },
			info,
			now
		);
		expect(event).toMatchObject({
			...preset,
			week: 2,
			weekday: 6,
			eventDate: null,
			createdAt: now,
			updatedAt: now
		});
		const [log] = await database.select().from(schema.actionLogs);
		expect(log).toMatchObject({
			actionType: 'CREATE_EVENT',
			actorUserId: actor.id,
			ipAddress: info.ipAddress,
			resourceId: String(event.id),
			newValue: { id: event.id, ...preset }
		});
		expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
		expect(messages).toEqual([
			{ type: 'log_created', id: log.id },
			{ type: 'event_changed', eventId: event.id, week: 2, action: 'create' }
		]);
	}
);
it('creates custom events with defaults, capitalization and a fixed date independent of the pool', async () => {
	const event = await createEvent(
		database,
		actor,
		{ ...input, weekday: 5, description: ' ', eventDate: '2027-01-01' },
		info,
		now
	);
	expect(event).toMatchObject({
		title: 'Evento custom',
		description: 'Evento personalizzato',
		compensation: 0,
		kind: 'custom',
		eventDate: '2027-01-01'
	});
	const [visible] = await listWeekEvents(database, actor, 2, null);
	expect(visible.concreteDate).toBe('2027-01-01');
});
it('lists all seven days in time order, including absent registrations in the total', async () => {
	const late = await fixture({ weekday: 2, startTime: '10:00', endTime: '11:00' });
	const early = await fixture({ weekday: 2, startTime: '08:00', endTime: '09:00', maxSlots: 1 });
	const sunday = await fixture({ weekday: 7 });
	await fixture({ week: 3 });
	const result = await listWeekEvents(database, actor, '2', '2026-12-30');
	expect(result.map((event) => event.id)).toEqual([early.id, late.id, sunday.id]);
	expect(result[0]).toMatchObject({
		registeredCount: 2,
		attendedCount: 1,
		concreteDate: '2027-01-07',
		participants: [
			{ participantLogin: 'absent', attended: false },
			{ participantLogin: 'present', attended: true }
		]
	});
	expect((await listWeekEvents(database, actor, 2, null))[0].concreteDate).toBeNull();
	await expect(listWeekEvents(database, actor, 0, null)).rejects.toThrow();
	await expect(listWeekEvents(database, { ...actor, role: 'user' }, 2, null)).rejects.toMatchObject(
		{ status: 403 }
	);
});
it('updates editable fields, allows capacity below registrations, and audits JSON before/after', async () => {
	const before = await fixture({ eventDate: '2026-11-01', kind: 'exam' });
	const event = await updateEvent(database, actor, { id: before.id, ...changes }, info, now);
	expect(event).toMatchObject({
		...changes,
		startTime: '11:00:00',
		endTime: '12:30:00',
		title: 'Evento modificato',
		description: 'Nuova descrizione',
		week: 2,
		kind: 'exam',
		eventDate: '2026-11-01',
		createdAt: before.createdAt,
		updatedAt: now
	});
	expect(await client`SELECT * FROM registrations`).toHaveLength(2);
	const [log] = await database.select().from(schema.actionLogs);
	expect(log).toMatchObject({
		actionType: 'UPDATE_EVENT',
		oldValue: { title: 'Fixture', maxSlots: 2 },
		newValue: { title: 'Evento modificato', maxSlots: 1 }
	});
	expect(messages).toEqual([
		{ type: 'log_created', id: log.id },
		{ type: 'event_changed', eventId: event.id, week: 2, action: 'update' }
	]);
});
it('locks the event so concurrent audit snapshots describe the actual preceding version', async () => {
	const event = await fixture();
	await Promise.all(
		['First', 'Second'].map((title) =>
			updateEvent(database, actor, { id: event.id, ...changes, title }, info, now)
		)
	);
	const logs = await database.select().from(schema.actionLogs).orderBy(schema.actionLogs.id);
	expect(logs).toHaveLength(2);
	expect(logs[0].oldValue).toMatchObject({ title: 'Fixture' });
	expect(logs[1].oldValue).toEqual(logs[0].newValue);
});
it.each([
	{ week: 0 },
	{ week: 5 },
	{ weekday: 0 },
	{ weekday: 8 },
	{ kind: 'unknown' },
	{ startTime: '24:00' },
	{ endTime: '09:60' },
	{ startTime: '9:00' },
	{ endTime: '09:00' },
	{ endTime: '08:00' },
	{ maxSlots: 0 },
	{ maxSlots: 1.5 },
	{ maxSlots: 2147483648 },
	{ compensation: -1 },
	{ compensation: '' },
	{ compensation: undefined },
	{ title: ' ' },
	{ title: 'x'.repeat(121) },
	{ description: 'x'.repeat(501) },
	{ eventDate: '2026-02-30' }
])('rejects invalid creation without writes or notifications: %j', async (invalid) => {
	await expect(createEvent(database, actor, { ...input, ...invalid }, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM events`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it.each([
	{ week: 3 },
	{ kind: 'rush' },
	{ eventDate: '2027-01-01' },
	{ title: '' },
	{ description: 'x'.repeat(501) },
	{ endTime: '10:00' }
])('rejects immutable fields and invalid updates: %j', async (invalid) => {
	const event = await fixture();
	await expect(
		updateEvent(database, actor, { id: event.id, ...changes, ...invalid }, info, now)
	).rejects.toThrow();
	expect((await client`SELECT title FROM events`)[0].title).toBe('Fixture');
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it.each([updateEvent, deleteEvent])(
	'returns 404 for missing events without audit (%s)',
	async (mutate) => {
		await expect(
			mutate(
				database,
				actor,
				mutate === updateEvent ? { id: 999, ...changes } : { id: 999 },
				info,
				now
			)
		).rejects.toMatchObject({ status: 404 });
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);
it.each([
	createEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents
])('guards every mutation before parsing (%s)', async (mutate) => {
	await expect(mutate(database, null, {}, info, now)).rejects.toMatchObject({ status: 401 });
	await expect(mutate(database, { ...actor, role: 'user' }, {}, info, now)).rejects.toMatchObject({
		status: 403
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it.each([
	['single', deleteEvent, 'DELETE_EVENT'],
	['day', deleteDayEvents, 'DELETE_DAY_EVENTS'],
	['week', deleteWeekEvents, 'DELETE_WEEK_EVENTS'],
	['all', deleteAllEvents, 'DELETE_ALL_EVENTS']
] as const)(
	'deletes %s scope with registrations in cascade, one audit and notification',
	async (scope, mutate, actionType) => {
		const target = await fixture();
		const otherDay = await fixture({ weekday: 1 });
		const otherWeek = await fixture({ week: 3 });
		const payload =
			scope === 'single'
				? { id: target.id }
				: scope === 'day'
					? { week: 2, weekday: 6, confirm: 'yes' }
					: scope === 'week'
						? { week: 2, confirm: 'yes' }
						: { confirm: 'yes' };
		await mutate(database, actor, payload, info);
		const remaining =
			scope === 'all' ? [] : scope === 'week' ? [otherWeek.id] : [otherDay.id, otherWeek.id];
		expect((await client`SELECT id FROM events ORDER BY id`).map((row) => row.id)).toEqual(
			remaining
		);
		expect(await client`SELECT * FROM registrations`).toHaveLength(remaining.length * 2);
		const logs = await database.select().from(schema.actionLogs);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toMatchObject({
			actionType,
			resourceId:
				scope === 'single'
					? String(target.id)
					: scope === 'day'
						? '2-6'
						: scope === 'week'
							? '2'
							: null
		});
		expect(messages).toEqual([
			{ type: 'log_created', id: logs[0].id },
			{
				type: 'event_changed',
				eventId: scope === 'single' ? target.id : null,
				week: scope === 'all' ? null : 2,
				action: scope === 'single' ? 'delete' : 'bulk_delete'
			}
		]);
	}
);
it.each([deleteDayEvents, deleteWeekEvents, deleteAllEvents])(
	'requires explicit confirmation for bulk deletion (%s)',
	async (mutate) => {
		await fixture();
		await expect(mutate(database, actor, {}, info)).rejects.toThrow();
		expect(await client`SELECT * FROM events`).toHaveLength(1);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);
it.each([
	createEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents
])('rolls back events and cascade when audit fails (%s)', async (mutate) => {
	const event = await fixture();
	const before = await client`SELECT * FROM events`;
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_events CHECK (action_type = 'LOGIN')`;
	try {
		const payload =
			mutate === createEvent
				? input
				: mutate === updateEvent
					? { id: event.id, ...changes }
					: mutate === deleteEvent
						? { id: event.id }
						: mutate === deleteDayEvents
							? { week: 2, weekday: 6, confirm: 'yes' }
							: mutate === deleteWeekEvents
								? { week: 2, confirm: 'yes' }
								: { confirm: 'yes' };
		await expect(mutate(database, actor, payload, info, now)).rejects.toThrow();
		expect(await client`SELECT * FROM events`).toEqual(before);
		expect(await client`SELECT * FROM registrations`).toHaveLength(2);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_reject_events`;
	}
});
