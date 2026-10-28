import { sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	serial,
	bigserial,
	integer,
	smallint,
	text,
	boolean,
	date,
	time,
	timestamp,
	jsonb,
	check,
	index,
	unique
} from 'drizzle-orm/pg-core';
import { EVENT_KINDS } from '#lib/kinds.ts';

export const userRole = pgEnum('user_role', ['user', 'admin']);
export const eventKind = pgEnum('event_kind', EVENT_KINDS);

export const users = pgTable(
	'users',
	{
		id: serial('id').primaryKey(),
		intraId: integer('intra_id').notNull().unique(),
		login: text('login').notNull().unique(),
		email: text('email'),
		displayName: text('display_name'),
		imageUrl: text('image_url'),
		wallet: integer('wallet').notNull().default(0),
		role: userRole('role').notNull().default('user'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true })
	},
	(t) => [check('users_login_lowercase', sql`${t.login} = lower(${t.login})`)]
);

export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const settings = pgTable(
	'settings',
	{
		id: smallint('id').primaryKey().default(1),
		poolStart: date('pool_start'),
		enrollmentCode: text('enrollment_code'),
		poolEnd: date('pool_end'),
		poolClosedAt: timestamp('pool_closed_at', { withTimezone: true }),
		poolReopened: boolean('pool_reopened').notNull().default(false),
		activeWeek: smallint('active_week').notNull().default(1),
		displayWeek: smallint('display_week').notNull().default(1),
		maxEventsPerUser: smallint('max_events_per_user').notNull().default(0),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		check('settings_singleton', sql`${t.id} = 1`),
		check('settings_active_week_range', sql`${t.activeWeek} BETWEEN 1 AND 4`),
		check('settings_display_week_range', sql`${t.displayWeek} BETWEEN 1 AND 4`),
		check('settings_max_events_nonnegative', sql`${t.maxEventsPerUser} >= 0`)
	]
);

export const events = pgTable(
	'events',
	{
		id: serial('id').primaryKey(),
		week: smallint('week').notNull(),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		kind: eventKind('kind').notNull().default('custom'),
		weekday: smallint('weekday').notNull(),
		eventDate: date('event_date'),
		startTime: time('start_time').notNull(),
		endTime: time('end_time').notNull(),
		maxSlots: integer('max_slots').notNull().default(10),
		compensation: integer('compensation').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('events_week_day_start_idx').on(t.week, t.weekday, t.startTime),
		check('events_week_range', sql`${t.week} BETWEEN 1 AND 4`),
		check('events_title_length', sql`char_length(${t.title}) BETWEEN 1 AND 120`),
		check('events_description_length', sql`char_length(${t.description}) <= 500`),
		check('events_weekday_range', sql`${t.weekday} BETWEEN 1 AND 7`),
		check('events_time_order', sql`${t.endTime} > ${t.startTime}`),
		check('events_slots_positive', sql`${t.maxSlots} >= 1`),
		check('events_compensation_nonnegative', sql`${t.compensation} >= 0`)
	]
);

export const registrations = pgTable(
	'registrations',
	{
		id: serial('id').primaryKey(),
		eventId: integer('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		participantLogin: text('participant_login').notNull(),
		attended: boolean('attended').notNull().default(true),
		registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		unique('registrations_event_login_unique').on(t.eventId, t.participantLogin),
		index('registrations_login_idx').on(t.participantLogin),
		check(
			'registrations_login_lowercase',
			sql`${t.participantLogin} = lower(${t.participantLogin})`
		)
	]
);

export const weekTemplates = pgTable(
	'week_templates',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		targetWeek: smallint('target_week').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		check('templates_name_length', sql`char_length(${t.name}) BETWEEN 1 AND 120`),
		check('templates_description_length', sql`char_length(${t.description}) <= 500`),
		check('templates_week_range', sql`${t.targetWeek} BETWEEN 1 AND 4`)
	]
);

export const templateEvents = pgTable(
	'template_events',
	{
		id: serial('id').primaryKey(),
		templateId: integer('template_id')
			.notNull()
			.references(() => weekTemplates.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		kind: eventKind('kind').notNull().default('custom'),
		weekday: smallint('weekday').notNull(),
		startTime: time('start_time').notNull(),
		endTime: time('end_time').notNull(),
		maxSlots: integer('max_slots').notNull().default(10),
		compensation: integer('compensation').notNull().default(0)
	},
	(t) => [
		check('template_events_title_length', sql`char_length(${t.title}) BETWEEN 1 AND 120`),
		check('template_events_description_length', sql`char_length(${t.description}) <= 500`),
		check('template_events_weekday_range', sql`${t.weekday} BETWEEN 1 AND 7`),
		check('template_events_time_order', sql`${t.endTime} > ${t.startTime}`),
		check('template_events_slots_positive', sql`${t.maxSlots} >= 1`),
		check('template_events_compensation_nonnegative', sql`${t.compensation} >= 0`)
	]
);

export const whitelist = pgTable(
	'whitelist',
	{
		id: serial('id').primaryKey(),
		login: text('login').notNull().unique(),
		addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
		weeks: smallint('weeks').array()
	},
	(t) => [
		check('whitelist_login_lowercase', sql`${t.login} = lower(${t.login})`),
		check(
			'whitelist_weeks_valid',
			sql`${t.weeks} IS NULL OR (cardinality(${t.weeks}) BETWEEN 1 AND 4 AND ${t.weeks} <@ ARRAY[1,2,3,4]::smallint[] AND array_position(${t.weeks}, NULL) IS NULL)`
		)
	]
);

export const enrollmentRequests = pgTable(
	'enrollment_requests',
	{
		login: text('login').primaryKey(),
		weeks: smallint('weeks').array().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		check('enrollment_login_lowercase', sql`${t.login} = lower(${t.login})`),
		check(
			'enrollment_weeks_valid',
			sql`cardinality(${t.weeks}) BETWEEN 1 AND 4 AND ${t.weeks} <@ ARRAY[1,2,3,4]::smallint[] AND array_position(${t.weeks}, NULL) IS NULL`
		)
	]
);

export const actionLogs = pgTable(
	'action_logs',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		actorLogin: text('actor_login').notNull(),
		actionType: text('action_type').notNull(),
		description: text('description').notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		resourceType: text('resource_type'),
		resourceId: text('resource_id'),
		oldValue: jsonb('old_value'),
		newValue: jsonb('new_value')
	},
	(t) => [
		index('logs_created_idx').on(t.createdAt.desc()),
		index('logs_actor_idx').on(t.actorLogin),
		index('logs_action_idx').on(t.actionType),
		check('logs_user_agent_length', sql`char_length(${t.userAgent}) <= 200`)
	]
);

export const pools = pgTable(
	'pools',
	{
		id: serial('id').primaryKey(),
		startDate: date('start_date').notNull().unique(),
		endDate: date('end_date'),
		source: text('source', { enum: ['site', 'csv'] }).notNull(),
		archivedAt: timestamp('archived_at', { withTimezone: true }).notNull()
	},
	(t) => [check('pools_source_valid', sql`${t.source} IN ('site', 'csv')`)]
);

export const poolEntries = pgTable(
	'pool_entries',
	{
		id: serial('id').primaryKey(),
		poolId: integer('pool_id')
			.notNull()
			.references(() => pools.id, { onDelete: 'cascade' }),
		login: text('login').notNull(),
		title: text('title').notNull(),
		kind: eventKind('kind').notNull(),
		eventDate: date('event_date'),
		weekday: smallint('weekday'),
		startTime: time('start_time'),
		endTime: time('end_time'),
		durationMinutes: integer('duration_minutes').notNull(),
		compensation: integer('compensation').notNull(),
		attended: boolean('attended').notNull(),
		registeredAt: timestamp('registered_at', { withTimezone: true }),
		week: smallint('week'),
		maxSlots: integer('max_slots'),
		eventRef: integer('event_ref'),
		weekActivatedAt: timestamp('week_activated_at', { withTimezone: true })
	},
	(t) => [
		index('pool_entries_pool_login_idx').on(t.poolId, t.login),
		check('pool_entries_login_lowercase', sql`${t.login} = lower(${t.login})`),
		check('pool_entries_weekday_range', sql`${t.weekday} BETWEEN 1 AND 7`),
		check('pool_entries_week_range', sql`${t.week} BETWEEN 1 AND 4`),
		check('pool_entries_duration_nonnegative', sql`${t.durationMinutes} >= 0`),
		check('pool_entries_compensation_nonnegative', sql`${t.compensation} >= 0`)
	]
);

export const weekActivations = pgTable('week_activations', {
	week: smallint('week').primaryKey(),
	activatedAt: timestamp('activated_at', { withTimezone: true }).notNull()
});
