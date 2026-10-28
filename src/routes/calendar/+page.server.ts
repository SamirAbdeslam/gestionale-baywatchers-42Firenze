import { calendarPoolView } from '#lib/server/domain/recap.ts';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { formAction } from '#lib/server/form-action.ts';
import { register, unregister } from '#lib/server/domain/registrations.ts';
import { getCalendar } from '#lib/server/domain/calendar.ts';
import { formatWeekDates, formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:calendar');
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const now = new Date();
		const poolView = await calendarPoolView(db, locals.user, now);
		const calendar = await getCalendar(db, locals.user, Object.fromEntries(url.searchParams), now);
		const data = poolView.calendar
			? calendar
			: { ...calendar, events: [], days: [], nextShift: null, weeklyRegistrationCount: null };
		return {
			...data,
			poolView,
			nextShift: data.nextShift
				? {
						...data.nextShift,
						formattedDate: formatEventDate(data.nextShift.date, getLocale())
					}
				: null,
			...formatWeekDates(data, getLocale())
		};
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
export const actions: Actions = {
	register: (event) => formAction(event, register),
	unregister: (event) => formAction(event, unregister)
};
