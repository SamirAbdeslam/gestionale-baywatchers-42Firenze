import { closePool, reopenPool, savePool, cleanPool, poolPhase } from '#lib/server/domain/pool.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAdminSettings,
	setActiveWeek,
	setMaxEvents,
	setPoolDates,
	resetDisplayWeek
} from '#lib/server/domain/settings.ts';
import {
	createEvent,
	duplicateEvent,
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents,
	listWeekEvents
} from '#lib/server/domain/events.ts';
import { events as poolEvents } from '#lib/server/db/schema.ts';
import { saveWeekAsTemplate } from '#lib/server/domain/templates.ts';
import { formAction } from '#lib/server/form-action.ts';
import {
	addParticipant,
	removeParticipant,
	setAttendance
} from '#lib/server/domain/registrations.ts';
import { EVENT_KINDS } from '#lib/kinds.ts';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:admin');
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const { dayDates, ...data } = await getAdminSettings(
			db,
			locals.user,
			Object.fromEntries(url.searchParams)
		);
		const events = await listWeekEvents(db, locals.user, data.week, data.settings.poolStart);
		return {
			...data,
			phase: poolPhase(data.settings, await db.select().from(poolEvents), new Date()),
			kinds: EVENT_KINDS,
			events: events.map((event) => ({
				...event,
				formattedDate: formatEventDate(event.concreteDate, getLocale())
			})),
			dayDates: dayDates.map((date) => (date === null ? null : formatEventDate(date, getLocale())))
		};
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
export const actions: Actions = {
	closePool: (event) => formAction(event, closePool),
	reopenPool: (event) => formAction(event, reopenPool),
	savePool: (event) => formAction(event, savePool),
	cleanPool: (event) => formAction(event, cleanPool),
	duplicateEvent: (event) =>
		formAction(event, duplicateEvent, {
			success: 'admin_event_created',
			notFound: 'error_event_not_found'
		}),
	saveWeekAsTemplate: (event) => formAction(event, saveWeekAsTemplate),
	setPoolDates: (event) =>
		formAction(event, setPoolDates, {
			notFound: 'error_event_not_found'
		}),
	setActiveWeek: (event) =>
		formAction(event, setActiveWeek, {
			success: 'admin_settings_saved',
			notFound: 'error_event_not_found'
		}),
	setMaxEvents: (event) =>
		formAction(event, setMaxEvents, {
			success: 'admin_settings_saved',
			notFound: 'error_event_not_found'
		}),
	createEvent: (event) =>
		formAction(event, createEvent, {
			success: 'admin_event_created',
			notFound: 'error_event_not_found'
		}),
	updateEvent: (event) =>
		formAction(event, updateEvent, {
			success: 'admin_event_updated',
			notFound: 'error_event_not_found'
		}),
	deleteEvent: (event) =>
		formAction(event, deleteEvent, {
			success: 'admin_event_deleted',
			notFound: 'error_event_not_found'
		}),
	deleteDayEvents: (event) =>
		formAction(event, deleteDayEvents, {
			success: 'admin_events_deleted',
			notFound: 'error_event_not_found'
		}),
	deleteWeekEvents: (event) =>
		formAction(event, deleteWeekEvents, {
			success: 'admin_events_deleted',
			notFound: 'error_event_not_found'
		}),
	deleteAllEvents: (event) =>
		formAction(event, deleteAllEvents, {
			success: 'admin_events_deleted',
			notFound: 'error_event_not_found'
		}),
	addParticipant: (event) => formAction(event, addParticipant),
	removeParticipant: (event) => formAction(event, removeParticipant),
	setAttendance: (event) => formAction(event, setAttendance),
	resetDisplayWeek: (event) =>
		formAction(
			event,
			(database, actor, ...[, info, now]) => resetDisplayWeek(database, actor, info, now),
			{ success: 'admin_settings_saved', notFound: 'error_event_not_found' }
		)
};
