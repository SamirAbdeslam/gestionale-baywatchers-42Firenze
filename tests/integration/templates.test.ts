import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as schema from '../../src/lib/server/db/schema.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
import {
	createTemplate,
	saveWeekAsTemplate,
	applyTemplate,
	deleteTemplate,
	importTemplates,
	listTemplates
} from '../../src/lib/server/domain/templates.ts';
import { subscribe, type RealtimeEvent } from '../../src/lib/server/realtime/bus.ts';
import { actions } from '../../src/routes/admin/templates/new/+page.server.ts';
import { setMaxEvents } from '../../src/lib/server/domain/settings.ts';
vi.mock('#lib/server/db/index.ts', () => ({ db: database }));
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
const database = drizzle(client, { schema });
const now = new Date('2026-10-21T10:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'template test' };
let admin: User, user: User, messages: RealtimeEvent[], stop: () => void;
const entry = {
	title: 'esami',
	description: 'test',
	weekday: 1,
	startTime: '09:00',
	endTime: '10:00',
	maxSlots: 2,
	compensation: 200
};
const payload = (changes = {}) => ({
	name: 'Template',
	description: 'Description',
	targetWeek: 2,
	events: [entry],
	...changes
});
const truncate = () =>
	client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
beforeEach(async () => {
	await truncate();
	[admin, user] = await database
		.insert(schema.users)
		.values([
			{ intraId: 1, login: 'staff', role: 'admin' },
			{ intraId: 2, login: 'student', role: 'user' }
		])
		.returning();
	messages = [];
	stop = subscribe((event) => messages.push(event));
});
afterEach(() => stop());
afterAll(async () => {
	await truncate();
	await client.end();
});
it('creates validated events, lists count/newest first and writes one audit after commit', async () => {
	expect(await listTemplates(database, admin)).toEqual([]);
	await createTemplate(database, admin, payload(), info, now);
	await createTemplate(
		database,
		admin,
		payload({ name: 'Newer' }),
		info,
		new Date(now.getTime() + 1000)
	);
	const list = await listTemplates(database, admin);
	expect(list.map((row) => row.name)).toEqual(['Newer', 'Template']);
	expect(list[0]).toMatchObject({ eventCount: 1, targetWeek: 2, description: 'Description' });
	expect(await client`SELECT title,kind,max_slots FROM template_events ORDER BY id`).toMatchObject([
		{ title: 'Esami', kind: 'exam', max_slots: 2 },
		{ title: 'Esami' }
	]);
	const logs = await database.select().from(schema.actionLogs);
	expect(logs).toHaveLength(2);
	expect(
		logs.every((log) => log.actionType === 'CREATE_TEMPLATE' && log.actorUserId === admin.id)
	).toBe(true);
	expect(messages).toEqual(logs.map((log) => ({ type: 'log_created', id: log.id })));
});
it('applies to an empty week with pool-derived dates, copies all fields and publishes once', async () => {
	await createTemplate(database, admin, payload(), info, now);
	messages = [];
	const result = await applyTemplate(database, admin, { id: 1 }, info, now);
	expect(result).toMatchObject({
		ok: true,
		week: 2,
		messages: [{ key: 'template_applied', params: { count: 1, deleted: 0 } }]
	});
	const [event] = await database.select().from(schema.events);
	expect(event).toMatchObject({
		...entry,
		title: 'Esami',
		description: 'Test',
		kind: 'exam',
		eventDate: null,
		week: 2,
		startTime: '09:00:00',
		endTime: '10:00:00'
	});
	const logs = await client`SELECT * FROM action_logs WHERE action_type='APPLY_TEMPLATE'`;
	expect(logs).toHaveLength(1);
	expect(logs[0].description).toContain('Sovrascrittura: false');
	expect(messages).toEqual([
		{ type: 'log_created', id: Number(logs[0].id) },
		{ type: 'event_changed', eventId: null, week: 2, action: 'update' }
	]);
});
it('warns without overwrite; overwrite cascades registrations and preserves complete audit snapshots', async () => {
	await createTemplate(database, admin, payload(), info, now);
	const [event] = await database
		.insert(schema.events)
		.values({ title: 'Old', week: 2, weekday: 3, startTime: '11:00', endTime: '12:00' })
		.returning();
	await database.insert(schema.registrations).values({
		eventId: event.id,
		participantLogin: user.login,
		attended: false,
		registeredAt: now
	});
	messages = [];
	expect(await applyTemplate(database, admin, { id: 1 }, info, now)).toMatchObject({
		ok: false,
		messages: [{ key: 'template_existing', params: { count: 1, week: 2 } }]
	});
	expect(await client`SELECT * FROM events`).toHaveLength(1);
	expect(messages).toEqual([]);
	await applyTemplate(database, admin, { id: '1', overwrite: 'true' }, info, now);
	expect(await client`SELECT * FROM registrations`).toHaveLength(0);
	const logs = await database.select().from(schema.actionLogs);
	expect(logs).toHaveLength(2);
	expect(logs[1].oldValue).toMatchObject([
		{
			id: event.id,
			title: 'Old',
			participants: [
				{ participantLogin: user.login, attended: false, registeredAt: now.toISOString() }
			]
		}
	]);
	expect(logs[1].description).toContain('Sovrascrittura: true');
});
it('empty legacy templates never delete events, audit or publish', async () => {
	await database.insert(schema.weekTemplates).values({ name: 'Empty', targetWeek: 2 });
	await database
		.insert(schema.events)
		.values({ title: 'Keep', week: 2, weekday: 1, startTime: '09:00', endTime: '10:00' });
	expect(
		await applyTemplate(database, admin, { id: 1, overwrite: 'true' }, info, now)
	).toMatchObject({ ok: false, messages: [{ key: 'template_empty' }] });
	expect(await client`SELECT * FROM events`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it('deletes only the template and its children with one audit', async () => {
	await createTemplate(database, admin, payload(), info, now);
	await applyTemplate(database, admin, { id: 1 }, info, now);
	await deleteTemplate(database, admin, { id: 1 }, info);
	expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
	expect(await client`SELECT * FROM template_events`).toHaveLength(0);
	expect(await client`SELECT * FROM events`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs WHERE action_type='DELETE_TEMPLATE'`).toHaveLength(
		1
	);
});
it('imports grouped weeks atomically with defaults, row numbers and one log', async () => {
	const file = new File(
		[
			'Week;Giorno;Orario;Tipo Evento;Data\n1;Lunedì;09:00-10:00;Esami;invalid\n9;Lunedi;09:00-10:00;Bad;\n4;Domenica;10:00-11:00;Cluster;'
		],
		'INPUT.CSV'
	);
	expect(await importTemplates(database, admin, { file }, info, now)).toMatchObject({
		ok: true,
		messages: [
			{ key: 'template_imported', params: { templates: 2, count: 2 } },
			{ key: 'template_skipped', params: { count: 1, rows: '3' } }
		]
	});
	expect((await listTemplates(database, admin)).map((t) => t.name)).toEqual([
		'Week 4 - Import CSV',
		'Week 1 - Import CSV'
	]);
	expect(await client`SELECT kind,max_slots,compensation FROM template_events ORDER BY id`).toEqual(
		[
			{ kind: 'exam', max_slots: 1, compensation: 0 },
			{ kind: 'cluster', max_slots: 1, compensation: 0 }
		]
	);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
	expect(messages).toHaveLength(1);
});
it('reports no valid rows without writes and truncates skipped line lists to twenty', async () => {
	const header = 'Week,Giorno,Orario,Tipo Evento\n';
	const invalid = '0,Lunedi,09:00-10:00,Bad\n'.repeat(25);
	expect(
		await importTemplates(
			database,
			admin,
			{ file: new File([header + invalid], 'a.csv') },
			info,
			now
		)
	).toMatchObject({
		ok: false,
		messages: [{ key: 'template_import_empty', params: { count: 25 } }]
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	const result = await importTemplates(
		database,
		admin,
		{ file: new File([header + invalid + '1,Lunedi,09:00-10:00,Valid'], 'a.csv') },
		info,
		now
	);
	expect(result.messages[1].params.rows?.split(', ')).toHaveLength(20);
});
it.each([
	{},
	{ name: 'Invalid', events: 'not an array' },
	payload({ name: '' }),
	payload({ events: [] }),
	payload({ events: [{ ...entry, startTime: '11:00' }] }),
	payload({ targetWeek: '0x2' })
])('rejects invalid builder input without writes: %s', async (input) => {
	await expect(createTemplate(database, admin, input, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it.each(['a.txt', 'empty.csv', 'big.csv'])('rejects invalid files: %s', async (name) => {
	const file = new File(
		[name === 'empty.csv' ? '' : name === 'big.csv' ? 'a'.repeat(1024 * 1024 + 1) : 'data'],
		name
	);
	await expect(importTemplates(database, admin, { file }, info, now)).rejects.toThrow();
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
it('returns 404 for missing templates without writes', async () => {
	await expect(applyTemplate(database, admin, { id: 999 }, info, now)).rejects.toMatchObject({
		status: 404
	});
	await expect(deleteTemplate(database, admin, { id: 999 }, info)).rejects.toMatchObject({
		status: 404
	});
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toEqual([]);
});
it.each([null, 'user'] as const)('guards all operations before validation: %s', async (role) => {
	const actor = role ? user : null;
	for (const call of [
		() => listTemplates(database, actor),
		() => createTemplate(database, actor, {}, info, now),
		() => applyTemplate(database, actor, {}, info, now),
		() => deleteTemplate(database, actor, {}, info),
		() => importTemplates(database, actor, {}, info, now)
	])
		await expect(call()).rejects.toMatchObject({ status: role ? 403 : 401 });
});
it('rechecks the role in the transaction and rolls back when audit cannot be stored', async () => {
	await expect(
		createTemplate(database, { ...user, role: 'admin' }, payload(), info, now)
	).rejects.toMatchObject({ status: 403 });
	await client`ALTER TABLE action_logs ADD CONSTRAINT reject_template_audit CHECK (action_type <> 'CREATE_TEMPLATE')`;
	try {
		await expect(createTemplate(database, admin, payload(), info, now)).rejects.toThrow();
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT reject_template_audit`;
	}
	expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
	expect(await client`SELECT * FROM template_events`).toHaveLength(0);
	expect(messages).toEqual([]);
});

it('serializes different admins applying different templates to the same empty week', async () => {
	const [secondAdmin] = await database
		.insert(schema.users)
		.values({ intraId: 3, login: 'other_staff', role: 'admin' })
		.returning();
	await createTemplate(database, admin, payload(), info, now);
	await createTemplate(database, secondAdmin, payload({ name: 'Other template' }), info, now);
	messages = [];
	const results = await Promise.all([
		applyTemplate(database, admin, { id: 1 }, info, now),
		applyTemplate(database, secondAdmin, { id: 2 }, info, now)
	]);
	expect(results.filter((result) => result.ok)).toHaveLength(1);
	expect(results.find((result) => !result.ok)).toMatchObject({
		messages: [{ key: 'template_existing', params: { count: 1, week: 2 } }]
	});
	expect(await client`SELECT * FROM events`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs WHERE action_type='APPLY_TEMPLATE'`).toHaveLength(
		1
	);
	expect(messages.filter((message) => message.type === 'event_changed')).toHaveLength(1);
});
it('uses user then settings locks for concurrent settings and template writes', async () => {
	await createTemplate(database, admin, payload(), info, now);
	await Promise.all([
		applyTemplate(database, admin, { id: 1 }, info, now),
		setMaxEvents(database, admin, { maxEvents: '5' }, info, now)
	]);
	expect(await client`SELECT * FROM events`).toHaveLength(1);
	expect(
		(await client`SELECT max_events_per_user FROM settings WHERE id=1`)[0].max_events_per_user
	).toBe(5);
});
it.each(['rows', 'description'] as const)(
	'rejects the builder %s limit with 400 and preserves input without writes',
	async (limit) => {
		const form = new FormData();
		form.set('intent', 'save');
		form.set('name', 'Limits');
		form.set('targetWeek', '1');
		form.set('description', limit === 'description' ? 'x'.repeat(501) : '');
		for (let index = 0; index < (limit === 'rows' ? 201 : 1); index++)
			for (const [key, value] of Object.entries(entry))
				form.set(`events.${index}.${key}`, String(value));
		const save = actions.save!;
		const result = await save({
			request: new Request('http://localhost/admin/templates/new?/save', {
				method: 'POST',
				body: form
			}),
			locals: { user: admin },
			getClientAddress: () => info.ipAddress
		} as Parameters<typeof save>[0]);
		expect(result).toMatchObject({
			status: 400,
			data: { ok: false, messages: [{ key: 'error_invalid_input' }], values: { name: 'Limits' } }
		});
		expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
		expect(await client`SELECT * FROM template_events`).toHaveLength(0);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(messages).toEqual([]);
	}
);
it('accepts exactly 200 rows and 500 description characters and enforces the database constraint', async () => {
	await createTemplate(
		database,
		admin,
		payload({ description: 'x'.repeat(500), events: Array.from({ length: 200 }, () => entry) }),
		info,
		now
	);
	expect(await client`SELECT * FROM template_events`).toHaveLength(200);
	await expect(
		client`INSERT INTO week_templates(name,description,target_week) VALUES ('Too long',${'x'.repeat(501)},1)`
	).rejects.toThrow();
	expect(await client`SELECT * FROM week_templates`).toHaveLength(1);
});

it('returns an empty kind array and stable weekday/time/id order in the existing template list query', async () => {
	const [empty, filled] = await database
		.insert(schema.weekTemplates)
		.values([
			{ name: 'Empty', targetWeek: 1 },
			{ name: 'Ordered', targetWeek: 2 }
		])
		.returning();
	await database.insert(schema.templateEvents).values([
		{
			...entry,
			templateId: filled.id,
			weekday: 3,
			startTime: '11:00',
			endTime: '12:00',
			kind: 'rush'
		},
		{
			...entry,
			templateId: filled.id,
			weekday: 1,
			startTime: '10:00',
			endTime: '11:00',
			kind: 'exam'
		},
		{ ...entry, templateId: filled.id, weekday: 1, startTime: '09:00', kind: 'welcome' },
		{
			...entry,
			templateId: filled.id,
			weekday: 1,
			startTime: '10:00',
			endTime: '11:00',
			kind: 'cluster'
		}
	]);
	const rows = await listTemplates(database, admin);
	expect(rows.find((row) => row.id === empty.id)).toMatchObject({ eventCount: 0, kinds: [] });
	expect(rows.find((row) => row.id === filled.id)).toMatchObject({
		eventCount: 4,
		kinds: ['welcome', 'exam', 'cluster', 'rush']
	});
});

it('saves only the selected week as a reusable template and applies it without dates or registrations', async () => {
	const [source] = await database
		.insert(schema.events)
		.values({
			...entry,
			staff: ['mrossi'],
			title: 'Edited exam',
			description: 'Test',
			kind: 'rush',
			week: 1,
			weekday: 7,
			eventDate: '2026-11-01'
		})
		.returning();
	await database.insert(schema.events).values({ ...entry, kind: 'custom', week: 2 });
	await database
		.insert(schema.registrations)
		.values({ eventId: source.id, participantLogin: 'student' });
	const result = await saveWeekAsTemplate(
		database,
		admin,
		{ week: '1', name: 'Saved', description: 'Reusable', targetWeek: '4' },
		info,
		now
	);
	expect(result).toMatchObject({
		ok: true,
		messages: [{ key: 'template_created', params: { count: 1, name: 'Saved' } }]
	});
	const [template] = await listTemplates(database, admin);
	expect(template).toMatchObject({
		name: 'Saved',
		description: 'Reusable',
		targetWeek: 4,
		eventCount: 1
	});
	const [copy] = await database.select().from(schema.templateEvents);
	expect(copy).toMatchObject({
		title: source.title,
		description: source.description,
		kind: 'rush',
		weekday: 7,
		startTime: source.startTime,
		endTime: source.endTime,
		maxSlots: source.maxSlots,
		compensation: source.compensation
	});
	const logs = await database.select().from(schema.actionLogs);
	expect(logs).toHaveLength(1);
	expect(logs[0]).toMatchObject({ actionType: 'CREATE_TEMPLATE', resourceId: String(template.id) });
	expect(messages).toEqual([{ type: 'log_created', id: logs[0].id }]);
	await applyTemplate(database, admin, { id: template.id }, info, now);
	const [applied] = await client`SELECT * FROM events WHERE week=4`;
	expect(applied).toMatchObject({ title: source.title, kind: 'rush', event_date: null, staff: [] });
	expect(copy).not.toHaveProperty('staff');
	expect(await client`SELECT * FROM registrations WHERE event_id=${applied.id}`).toHaveLength(0);
});
it('warns for an empty week without creating a template or audit', async () => {
	expect(
		await saveWeekAsTemplate(database, admin, { week: 3, name: 'Empty' }, info, now)
	).toMatchObject({ ok: false, messages: [{ type: 'warning', key: 'template_week_empty' }] });
	expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
	expect(messages).toHaveLength(0);
});
it('defaults the target to the selected week and enforces the 200-event limit', async () => {
	await database.insert(schema.events).values({ ...entry, kind: 'custom', week: 3 });
	await saveWeekAsTemplate(database, admin, { week: 3, name: 'Default' }, info, now);
	expect((await listTemplates(database, admin))[0].targetWeek).toBe(3);
	await database
		.insert(schema.events)
		.values(Array.from({ length: 200 }, () => ({ ...entry, kind: 'custom' as const, week: 3 })));
	await expect(
		saveWeekAsTemplate(database, admin, { week: 3, name: 'Too many' }, info, now)
	).rejects.toThrow();
	expect(await client`SELECT * FROM week_templates`).toHaveLength(1);
	expect(await client`SELECT * FROM action_logs`).toHaveLength(1);
});
it('guards saving a week and rolls back the template when auditing fails', async () => {
	for (const [actor, status] of [
		[null, 401],
		[user, 403]
	] as const) {
		await expect(saveWeekAsTemplate(database, actor, {}, info, now)).rejects.toMatchObject({
			status
		});
	}
	await database.insert(schema.events).values({ ...entry, kind: 'custom', week: 1 });
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_save_week_audit CHECK (action_type = 'LOGIN')`;
	try {
		await expect(
			saveWeekAsTemplate(database, admin, { week: 1, name: 'Rollback' }, info, now)
		).rejects.toThrow();
		expect(await client`SELECT * FROM week_templates`).toHaveLength(0);
		expect(await client`SELECT * FROM template_events`).toHaveLength(0);
		expect(messages).toHaveLength(0);
	} finally {
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_save_week_audit`;
	}
});
