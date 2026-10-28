import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	createEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents
} from '../../src/lib/server/domain/events.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';
import { actions as adminActions } from '../../src/routes/admin/+page.server.ts';
import { actions as calendarActions } from '../../src/routes/calendar/+page.server.ts';
import { actions as whitelistActions } from '../../src/routes/admin/whitelist/+page.server.ts';

// Route actions share the real test database used by the assertions.
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-20T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'review test' };
const input = {
	week: 2,
	weekday: 2,
	kind: 'custom' as const,
	title: 'Fixture',
	description: '',
	startTime: '09:00',
	endTime: '10:00',
	maxSlots: 5,
	compensation: 0
};
const changes = {
	title: 'Changed',
	description: '',
	weekday: 2,
	startTime: '10:00',
	endTime: '11:00',
	maxSlots: 3,
	compensation: 1
};
let actor: User, messages: RealtimeEvent[], stop: () => void;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	[actor] = await database
		.insert(schema.users)
		.values({ intraId: 1, login: 'review_staff', role: 'admin' })
		.returning();
	messages = [];
	stop = subscribe((message) => messages.push(message));
});
afterEach(() => stop());
afterAll(async () => {
	await truncate();
	await client.end();
});
async function post(
	action:
		| (typeof adminActions)['createEvent']
		| (typeof calendarActions)['register']
		| (typeof whitelistActions)['add'],
	form: Record<string, string>
) {
	return action!({
		locals: { user: actor },
		request: new Request('http://localhost:4173/admin', {
			method: 'POST',
			body: new URLSearchParams(form)
		}),
		getClientAddress: () => info.ipAddress
	} as never);
}
it.each(['0x2', '1e0', ' 2 ', ''])(
	'rejects non-decimal inputs with 400 in all four domains (%s)',
	async (value) => {
		for (const [action, form] of [
			[adminActions.setActiveWeek, { week: value }],
			[adminActions.deleteEvent, { id: value }],
			[calendarActions.register, { id: value }],
			[whitelistActions.remove, { id: value }]
		] as const)
			expect(await post(action, form)).toMatchObject({
				status: 400,
				data: { ok: false, messages: [{ key: 'error_invalid_input' }] }
			});
		expect(await client`SELECT * FROM events`).toHaveLength(0);
		expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
		expect(await client`SELECT * FROM registrations`).toHaveLength(0);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toEqual([]);
	}
);
it('rejects whitelist batches above 5000 characters with 400, without writes', async () => {
	expect(await post(whitelistActions.add, { logins: 'a '.repeat(2500) + 'b' })).toMatchObject({
		status: 400
	});
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it.each([
	createEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents
])('rejects a demoted event admin without changes (%s)', async (mutate) => {
	const [event] = await database.insert(schema.events).values(input).returning();
	await client`UPDATE users SET role='user' WHERE id=${actor.id}`;
	const payload =
		mutate === createEvent
			? input
			: mutate === updateEvent
				? { id: event.id, ...changes }
				: mutate === deleteEvent
					? { id: event.id }
					: mutate === deleteDayEvents
						? { week: 2, weekday: 2, confirm: 'yes' }
						: mutate === deleteWeekEvents
							? { week: 2, confirm: 'yes' }
							: { confirm: 'yes' };
	await expect(mutate(database, actor, payload, info, now)).rejects.toMatchObject({ status: 403 });
	expect(await database.select().from(schema.events)).toEqual([event]);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
for (const participants of [true, false])
	it.each([
		['single', deleteEvent],
		['day', deleteDayEvents],
		['week', deleteWeekEvents],
		['all', deleteAllEvents]
	] as const)(
		`preserves exact deletion snapshots for %s, participants=${participants}`,
		async (scope, mutate) => {
			const [event] = await database.insert(schema.events).values(input).returning();
			const registrations = participants
				? await database
						.insert(schema.registrations)
						.values([
							{ eventId: event.id, participantLogin: 'alpha', attended: false, registeredAt: now },
							{ eventId: event.id, participantLogin: 'zeta', attended: true, registeredAt: now }
						])
						.returning()
				: [];
			const [other] = await database
				.insert(schema.events)
				.values({ ...input, week: 3 })
				.returning();
			const payload =
				scope === 'single'
					? { id: event.id }
					: scope === 'day'
						? { week: 2, weekday: 2, confirm: 'yes' }
						: scope === 'week'
							? { week: 2, confirm: 'yes' }
							: { confirm: 'yes' };
			await mutate(database, actor, payload, info);
			const expected = [
				{ ...event, participants: registrations },
				...(scope === 'all' ? [{ ...other, participants: [] }] : [])
			];
			const [log] = await database.select().from(schema.actionLogs);
			expect(log.oldValue).toEqual(JSON.parse(JSON.stringify(expected)));
			expect(await client`SELECT * FROM registrations`).toHaveLength(0);
		}
	);
it('maps thrown and returned 404 results to their original action messages', async () => {
	for (const [action, form, key] of [
		[adminActions.deleteEvent, { id: '999' }, 'error_event_not_found'],
		[calendarActions.register, { id: '999' }, 'error_event_not_found'],
		[whitelistActions.remove, { id: '999' }, 'error_whitelist_not_found']
	] as const)
		expect(await post(action, form)).toMatchObject({
			status: 404,
			data: { ok: false, messages: [{ type: 'error', key }] }
		});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('warns on missing admin removal but keeps own unregistration silent, without audit or notifications', async () => {
	const [event] = await database.insert(schema.events).values(input).returning();
	expect(
		await post(adminActions.removeParticipant, { id: String(event.id), login: 'missing' })
	).toEqual({
		ok: true,
		messages: [
			{ type: 'warning', key: 'registration_not_registered_login', params: { login: 'missing' } }
		]
	});
	expect(await post(calendarActions.unregister, { id: String(event.id) })).toEqual({
		ok: true,
		messages: []
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});

it('rejects incoherent specific dates on create and update with 400 and the dedicated message', async () => {
	const form = Object.fromEntries(
		Object.entries({ ...input, weekday: 3, eventDate: '2026-10-26' }).map(([key, value]) => [
			key,
			String(value)
		])
	);
	expect(await post(adminActions.createEvent, form)).toMatchObject({
		status: 400,
		data: { messages: [{ key: 'error_event_date_weekday' }] }
	});
	expect(await client`SELECT * FROM events`).toHaveLength(0);
	const coherent = { ...form, weekday: '1' };
	expect(await post(adminActions.createEvent, coherent)).toMatchObject({ ok: true });
	const [before] = await database.select().from(schema.events);
	const previousLogs = await client`SELECT * FROM action_logs ORDER BY id`;
	const previousMessages = [...messages];
	const update = Object.fromEntries(
		Object.entries({ ...changes, id: before.id, weekday: 3 }).map(([key, value]) => [
			key,
			String(value)
		])
	);
	expect(await post(adminActions.updateEvent, update)).toMatchObject({
		status: 400,
		data: { messages: [{ key: 'error_event_date_weekday' }] }
	});
	expect(await database.select().from(schema.events)).toEqual([before]);
	expect(await client`SELECT * FROM action_logs ORDER BY id`).toEqual(previousLogs);
	expect(messages).toEqual(previousMessages);
	expect(await post(adminActions.updateEvent, { ...update, weekday: '1' })).toMatchObject({
		ok: true
	});
});
