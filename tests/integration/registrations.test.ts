import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	register,
	unregister,
	addParticipant,
	removeParticipant,
	setAttendance
} from '../../src/lib/server/domain/registrations.ts';
import { updateEvent } from '../../src/lib/server/domain/events.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-19T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'registrations test' };
let user: User, admin: User, messages: RealtimeEvent[], stop: () => void;
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=1,max_events_per_user=0 WHERE id=1`;
	[user, admin] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'student', role: 'user' },
			{ intraId: 2, login: 'staff', role: 'admin' }
		])
		.returning();
	await database.insert(schema.whitelist).values({ login: user.login });
	messages = [];
	stop = subscribe((message) => messages.push(message));
});
afterEach(() => stop());
afterAll(async () => {
	await truncate();
	await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start=null,pool_end=null,active_week=1,display_week=1,max_events_per_user=0 WHERE id=1`;
	await client.end();
});
async function event(values: Partial<typeof schema.events.$inferInsert> = {}) {
	const [row] = await database
		.insert(schema.events)
		.values({
			title: 'Test event',
			week: 1,
			weekday: 1,
			eventDate: '2026-10-20',
			startTime: '09:00',
			endTime: '12:00',
			maxSlots: 5,
			...values
		})
		.returning();
	return row;
}
async function signup(id: number, login = user.login, attended = true) {
	await database
		.insert(schema.registrations)
		.values({ eventId: id, participantLogin: login, attended });
}
it('registers with one audit and publishes only after the committed change', async () => {
	const row = await event();
	const result = await register(database, user, { id: String(row.id) }, info, now);
	expect(result).toMatchObject({
		ok: true,
		registeredEventId: row.id,
		messages: [{ key: 'registration_registered' }]
	});
	expect(await database.select().from(schema.registrations)).toMatchObject([
		{ eventId: row.id, participantLogin: user.login, attended: true, registeredAt: now }
	]);
	const logs = await database.select().from(schema.actionLogs);
	expect(logs).toHaveLength(1);
	expect(logs[0]).toMatchObject({
		actionType: 'REGISTER_EVENT',
		actorUserId: user.id,
		actorLogin: user.login,
		resourceId: String(row.id),
		ipAddress: info.ipAddress
	});
	expect(messages).toEqual([
		{ type: 'log_created', id: logs[0].id },
		{ type: 'event_changed', eventId: row.id, week: 1, action: 'update' }
	]);
});
it('checks 404, whitelist, passed, weekly limit, duplicate and capacity in the specified order', async () => {
	const row = await event({ eventDate: '2026-10-18', maxSlots: 1 });
	await signup(row.id);
	await client`DELETE FROM whitelist`;
	expect((await register(database, user, { id: 999 }, info, now)).messages[0].key).toBe(
		'error_event_not_found'
	);
	expect((await register(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_not_whitelisted'
	);
	await database.insert(schema.whitelist).values({ login: user.login });
	expect((await register(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_event_passed'
	);
	await client`UPDATE events SET event_date='2026-10-20' WHERE id=${row.id}`;
	await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
	expect(await register(database, user, { id: row.id }, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'error_weekly_limit', params: { count: 1 } }]
	});
	await client`UPDATE settings SET max_events_per_user=0 WHERE id=1`;
	expect((await register(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_already_registered'
	);
	await client`UPDATE registrations SET participant_login='other',attended=false`;
	expect((await register(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_event_full'
	);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it('counts absent bookings in the weekly limit, excludes other weeks, and supports zero unlimited', async () => {
	const other = await event({ week: 2 });
	const first = await event();
	const second = await event();
	await signup(other.id, user.login, false);
	await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
	expect((await register(database, user, { id: first.id }, info, now)).ok).toBe(true);
	await client`UPDATE registrations SET attended=false WHERE event_id=${first.id}`;
	expect((await register(database, user, { id: second.id }, info, now)).messages[0].key).toBe(
		'error_weekly_limit'
	);
	await client`UPDATE settings SET max_events_per_user=0 WHERE id=1`;
	expect((await register(database, user, { id: second.id }, info, now)).ok).toBe(true);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(2);
});
it('accepts the exact end instant, then rejects one millisecond later before duplicate checks', async () => {
	const row = await event({ eventDate: '2026-10-19' });
	expect((await register(database, user, { id: row.id }, info, now)).ok).toBe(true);
	expect(
		(await register(database, user, { id: row.id }, info, new Date(now.getTime() + 1))).messages[0]
			.key
	).toBe('error_event_passed');
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it('uses pool dates unless the event has a fixed date, and accepts dates unset', async () => {
	const row = await event({ eventDate: null });
	expect((await register(database, user, { id: row.id }, info, now)).ok).toBe(true);
	await unregister(database, user, { id: row.id }, info, now);
	await client`UPDATE settings SET pool_start='2026-10-01' WHERE id=1`;
	expect((await register(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_event_passed'
	);
	await client`UPDATE events SET event_date='2026-10-20' WHERE id=${row.id}`;
	expect((await register(database, user, { id: row.id }, info, now)).ok).toBe(true);
});
it('unregisters only the actor, ignores whitelist, and is idempotent without extra audit or events', async () => {
	const row = await event();
	await signup(row.id, user.login, false);
	await signup(row.id, 'other');
	await client`DELETE FROM whitelist`;
	expect((await unregister(database, user, { id: row.id }, info, now)).ok).toBe(true);
	const before = [...messages];
	expect(await unregister(database, user, { id: row.id }, info, now)).toEqual({
		ok: true,
		messages: []
	});
	expect(messages).toEqual(before);
	expect(
		(await client`SELECT participant_login FROM registrations`).map((row) => row.participant_login)
	).toEqual(['other']);
	expect((await client`SELECT action_type FROM action_logs`).map((row) => row.action_type)).toEqual(
		['UNREGISTER_EVENT']
	);
});
it('blocks past unregistration for a user but allows an admin to unregister themself', async () => {
	const row = await event({ eventDate: '2026-10-18' });
	await signup(row.id);
	await signup(row.id, admin.login);
	expect((await unregister(database, user, { id: row.id }, info, now)).messages[0].key).toBe(
		'error_event_passed_unregister'
	);
	expect((await unregister(database, admin, { id: row.id }, info, now)).ok).toBe(true);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	expect((await client`SELECT action_type FROM action_logs`).map((row) => row.action_type)).toEqual(
		['UNREGISTER_EVENT']
	);
});
it('admin bypasses every user restriction, normalizes unknown logins and audits add/presence/remove exactly once', async () => {
	const row = await event({ eventDate: '2026-10-18', maxSlots: 1 });
	await signup(row.id);
	await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
	expect(
		(await addParticipant(database, admin, { id: row.id, login: '  External_Login  ' }, info, now))
			.ok
	).toBe(true);
	expect(await client`SELECT id FROM users WHERE login='external_login'`).toHaveLength(0);
	const before = [...messages];
	expect(
		await addParticipant(database, admin, { id: row.id, login: 'EXTERNAL_LOGIN' }, info, now)
	).toMatchObject({
		ok: false,
		messages: [
			{
				type: 'warning',
				key: 'registration_already_registered_login',
				params: { login: 'external_login' }
			}
		]
	});
	expect(messages).toEqual(before);
	expect(await client`SELECT * FROM registrations`).toHaveLength(2);
	expect(
		(
			await setAttendance(
				database,
				admin,
				{ id: row.id, login: 'external_login', attended: 'false' },
				info,
				now
			)
		).messages[0].key
	).toBe('registration_absent');
	expect(
		(await client`SELECT attended FROM registrations WHERE participant_login='external_login'`)[0]
			.attended
	).toBe(false);
	expect(
		(
			await setAttendance(
				database,
				admin,
				{ id: row.id, login: 'external_login', attended: true },
				info,
				now
			)
		).messages[0].key
	).toBe('registration_present');
	expect(
		(await removeParticipant(database, admin, { id: row.id, login: 'EXTERNAL_LOGIN' }, info, now))
			.ok
	).toBe(true);
	expect(
		await removeParticipant(database, admin, { id: row.id, login: 'external_login' }, info, now)
	).toEqual({
		ok: true,
		messages: [
			{
				type: 'warning',
				key: 'registration_not_registered_login',
				params: { login: 'external_login' }
			}
		]
	});
	expect(
		(await client`SELECT action_type FROM action_logs ORDER BY id`).map((row) => row.action_type)
	).toEqual(['ADMIN_ADD_PARTICIPANT', 'MARK_ABSENT', 'MARK_PRESENT', 'ADMIN_UNREGISTER']);
	expect(messages).toHaveLength(8);
});
it.each([register, unregister, addParticipant, removeParticipant, setAttendance])(
	'returns event 404 before writes (%s)',
	async (mutate) => {
		const input =
			mutate === register || mutate === unregister
				? { id: 999 }
				: mutate === setAttendance
					? { id: 999, login: 'someone', attended: false }
					: { id: 999, login: 'someone' };
		expect(await mutate(database, admin, input, info, now)).toMatchObject({
			ok: false,
			status: 404,
			messages: [{ key: 'error_event_not_found' }]
		});
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	}
);
it('returns registration 404 and changes only the requested presence row', async () => {
	const first = await event();
	const second = await event();
	expect(
		await setAttendance(
			database,
			admin,
			{ id: first.id, login: 'missing', attended: false },
			info,
			now
		)
	).toMatchObject({ status: 404, messages: [{ key: 'error_registration_not_found' }] });
	await signup(first.id);
	await signup(second.id);
	await setAttendance(
		database,
		admin,
		{ id: first.id, login: user.login, attended: false },
		info,
		now
	);
	expect(
		(await client`SELECT attended FROM registrations ORDER BY event_id`).map((row) => row.attended)
	).toEqual([false, true]);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it.each([register, unregister, addParticipant, removeParticipant, setAttendance])(
	'requires authentication before validation (%s)',
	async (mutate) => {
		await expect(mutate(database, null, {}, info, now)).rejects.toMatchObject({ status: 401 });
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	}
);
it.each([addParticipant, removeParticipant, setAttendance])(
	'requires a current admin role for reserved operations (%s)',
	async (mutate) => {
		await expect(mutate(database, user, {}, info, now)).rejects.toMatchObject({ status: 403 });
		const row = await event();
		await expect(
			mutate(
				database,
				{ ...user, role: 'admin' },
				{ id: row.id, login: 'person', ...(mutate === setAttendance ? { attended: true } : {}) },
				info,
				now
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	}
);
it.each([
	[register, { id: 0 }],
	[register, { id: 1, login: 'spoofed' }],
	[unregister, { id: 1, login: 'spoofed' }],
	[addParticipant, { id: 1, login: ' ' }],
	[addParticipant, { id: 1, login: '<img>' }],
	[removeParticipant, { id: 1, login: 'x'.repeat(33) }],
	[setAttendance, { id: 1, login: 'person', attended: '0' }],
	[setAttendance, { id: 1, login: 'person', attended: 'False' }]
])('rejects invalid inputs without writes (%s)', async (mutate, input) => {
	await expect(mutate(database, admin, input, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM registrations`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it('admits exactly five of twenty simultaneous users and counts all bookings', async () => {
	const row = await event({ maxSlots: 5 });
	const people = await database
		.insert(schema.users)
		.values(
			Array.from({ length: 20 }, (_, index) => ({
				intraId: 100 + index,
				login: `concurrent_${index}`,
				role: 'user' as const
			}))
		)
		.returning();
	await database.insert(schema.whitelist).values(people.map((person) => ({ login: person.login })));
	const outcomes = await Promise.all(
		people.map((person) => register(database, person, { id: row.id }, info, now))
	);
	expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(5);
	expect(outcomes.filter((outcome) => outcome.messages[0].key === 'error_event_full')).toHaveLength(
		15
	);
	expect(await client`SELECT * FROM registrations`).toHaveLength(5);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(5);
	expect(messages).toHaveLength(10);
});
it('two simultaneous bookings by one user produce one row and one duplicate result', async () => {
	const row = await event();
	const outcomes = await Promise.all([
		register(database, user, { id: row.id }, info, now),
		register(database, user, { id: row.id }, info, now)
	]);
	expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
	expect(
		outcomes.filter((outcome) => outcome.messages[0].key === 'error_already_registered')
	).toHaveLength(1);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it('serializes bookings for different events so the weekly limit cannot be exceeded', async () => {
	const first = await event();
	const second = await event();
	await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
	const outcomes = await Promise.all(
		[first, second].map((row) => register(database, user, { id: row.id }, info, now))
	);
	expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
	expect(
		outcomes.filter((outcome) => outcome.messages[0].key === 'error_weekly_limit')
	).toHaveLength(1);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
});
it('concurrent admin additions of the same normalized login remain unique', async () => {
	const row = await event();
	const [other] = await database
		.insert(schema.users)
		.values({ intraId: 3, login: 'other_staff', role: 'admin' })
		.returning();
	const outcomes = await Promise.all([
		addParticipant(database, admin, { id: row.id, login: 'external' }, info, now),
		addParticipant(database, other, { id: row.id, login: ' EXTERNAL ' }, info, now)
	]);
	expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
	expect(outcomes.filter((outcome) => outcome.messages[0].type === 'warning')).toHaveLength(1);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it('shares user-before-event lock order with concurrent event updates and audit', async () => {
	const row = await event({ maxSlots: 100, weekday: 2 });
	await database.insert(schema.whitelist).values({ login: admin.login });
	const updates = {
		id: row.id,
		title: 'Updated',
		description: '',
		weekday: 2,
		startTime: '09:00',
		endTime: '12:00',
		maxSlots: 100,
		compensation: 0
	};
	await Promise.all(
		Array.from({ length: 10 }, (_, index) =>
			index % 2
				? updateEvent(database, admin, updates, info, now)
				: register(database, admin, { id: row.id }, info, now)
		)
	);
	expect(await client`SELECT * FROM registrations`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(6);
});
it.each(['register', 'unregister', 'add', 'remove', 'present', 'absent'] as const)(
	'rolls back %s and emits no notification if audit fails',
	async (operation) => {
		const row = await event();
		if (operation !== 'register' && operation !== 'add')
			await signup(row.id, user.login, operation !== 'present');
		const before = await client`SELECT * FROM registrations`;
		await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_registration CHECK (action_type='LOGIN')`;
		try {
			const mutate =
				operation === 'register'
					? register
					: operation === 'unregister'
						? unregister
						: operation === 'add'
							? addParticipant
							: operation === 'remove'
								? removeParticipant
								: setAttendance;
			const actor = operation === 'register' || operation === 'unregister' ? user : admin;
			const input =
				operation === 'register' || operation === 'unregister'
					? { id: row.id }
					: operation === 'present' || operation === 'absent'
						? { id: row.id, login: user.login, attended: operation === 'present' }
						: { id: row.id, login: user.login };
			await expect(mutate(database, actor, input, info, now)).rejects.toThrow();
			expect(await client`SELECT * FROM registrations`).toEqual(before);
			expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
			expect(messages).toHaveLength(0);
		} finally {
			await client`ALTER TABLE action_logs DROP CONSTRAINT test_reject_registration`;
		}
	}
);

it('rejects user registration before Rome pool midnight without writes or notifications', async () => {
	const row = await event();
	await client`UPDATE settings SET pool_start='2026-10-20',pool_end='2026-11-16' WHERE id=1`;
	const rejected = await register(
		database,
		user,
		{ id: row.id },
		info,
		new Date('2026-10-19T21:59:59Z')
	);
	expect(rejected).toMatchObject({ ok: false, messages: [{ key: 'error_pool_not_started' }] });
	expect(await database.select().from(schema.registrations)).toHaveLength(0);
	expect(await database.select().from(schema.actionLogs)).toHaveLength(0);
	expect(messages).toEqual([]);
	expect(
		(await register(database, user, { id: row.id }, info, new Date('2026-10-19T22:00:00Z'))).ok
	).toBe(true);
});
