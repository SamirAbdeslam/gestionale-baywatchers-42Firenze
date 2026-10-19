import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAdminSettings,
	setActiveWeek,
	setMaxEvents,
	setPoolDates,
	resetDisplayWeek
} from '#lib/server/domain/settings.ts';
import { m } from '#lib/paraglide/messages.js';
import { getLocale } from '#lib/paraglide/runtime.js';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import type { Actions, PageServerLoad } from './$types';
import type { RequestEvent } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const data = await getAdminSettings(db, locals.user, Object.fromEntries(url.searchParams));
		return {
			...data,
			formattedDayDates: data.dayDates.map((date) => formatEventDate(date, getLocale()))
		};
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
async function save(event: RequestEvent, mutate: typeof setActiveWeek) {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		await mutate(
			db,
			event.locals.user,
			Object.fromEntries(await event.request.formData()),
			{ ipAddress: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') },
			new Date()
		);
		return { message: m.admin_settings_saved() };
	} catch (cause) {
		if (cause instanceof z.ZodError) return fail(400, { message: m.error_invalid_input() });
		throw cause;
	}
}
// Event mutations are implemented by their owning modules.
const pending = () => fail(501, { message: m.error_not_implemented() });
export const actions: Actions = {
	setPoolDates: (event) => save(event, setPoolDates),
	setActiveWeek: (event) => save(event, setActiveWeek),
	setMaxEvents: (event) => save(event, setMaxEvents),
	createEvent: pending,
	updateEvent: pending,
	deleteEvent: pending,
	deleteDayEvents: pending,
	deleteWeekEvents: pending,
	deleteAllEvents: pending,
	addParticipant: pending,
	removeParticipant: pending,
	setAttendance: pending,
	resetDisplayWeek: (event) => save(event, resetDisplayWeek)
};
