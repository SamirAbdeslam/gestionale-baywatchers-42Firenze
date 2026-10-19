import { error, fail, isHttpError } from '@sveltejs/kit';
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
	updateEvent,
	deleteEvent,
	deleteDayEvents,
	deleteWeekEvents,
	deleteAllEvents,
	listWeekEvents
} from '#lib/server/domain/events.ts';
import { EVENT_KINDS } from '#lib/server/domain/kinds.ts';
import type { Notice } from '#lib/components/Toast.svelte';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import type { Actions, PageServerLoad } from './$types';
import type { RequestEvent } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
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
async function save(
	event: RequestEvent,
	mutate: (...args: Parameters<typeof setActiveWeek>) => Promise<unknown>,
	key: Notice['key'] = 'admin_settings_saved'
) {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		await mutate(
			db,
			event.locals.user,
			Object.fromEntries(await event.request.formData()),
			{ ipAddress: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') },
			new Date()
		);
		return { ok: true, messages: [{ type: 'success' as const, key, params: {} }] };
	} catch (cause) {
		if (cause instanceof z.ZodError) {
			const key = cause.issues.every((issue) => issue.message === 'error_pool_end_before_start')
				? ('error_pool_end_before_start' as const)
				: ('error_invalid_input' as const);
			return fail(400, {
				ok: false,
				messages: [{ type: 'error' as const, key, params: {} }]
			});
		}
		if (isHttpError(cause, 404))
			return fail(404, {
				ok: false,
				messages: [{ type: 'error' as const, key: 'error_event_not_found' as const, params: {} }]
			});
		throw cause;
	}
}
// Event mutations are implemented by their owning modules.
const pending = () => fail(501, { message: m.error_not_implemented() });
export const actions: Actions = {
	setPoolDates: (event) => save(event, setPoolDates),
	setActiveWeek: (event) => save(event, setActiveWeek),
	setMaxEvents: (event) => save(event, setMaxEvents),
	createEvent: (event) => save(event, createEvent, 'admin_event_created'),
	updateEvent: (event) => save(event, updateEvent, 'admin_event_updated'),
	deleteEvent: (event) => save(event, deleteEvent, 'admin_event_deleted'),
	deleteDayEvents: (event) => save(event, deleteDayEvents, 'admin_events_deleted'),
	deleteWeekEvents: (event) => save(event, deleteWeekEvents, 'admin_events_deleted'),
	deleteAllEvents: (event) => save(event, deleteAllEvents, 'admin_events_deleted'),
	addParticipant: pending,
	removeParticipant: pending,
	setAttendance: pending,
	resetDisplayWeek: (event) =>
		save(event, (database, actor, ...[, info, now]) => resetDisplayWeek(database, actor, info, now))
};
