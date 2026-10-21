import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { formAction } from '#lib/server/form-action.ts';
import { register, unregister } from '#lib/server/domain/registrations.ts';
import { getCalendar } from '#lib/server/domain/calendar.ts';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:calendar');
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const data = await getCalendar(
			db,
			locals.user,
			Object.fromEntries(url.searchParams),
			new Date()
		);
		return {
			...data,
			days: data.days.map((day) => ({ ...day, date: formatEventDate(day.date, getLocale()) })),
			events: data.events.map((event) => ({
				...event,
				date: formatEventDate(event.date, getLocale())
			}))
		};
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
export const actions: Actions = {
	register: async (event) => {
		const id = (await event.request.clone().formData()).get('id');
		const result = await formAction(event, register);
		return 'ok' in result && result.ok ? { ...result, registeredEventId: Number(id) } : result;
	},
	unregister: (event) => formAction(event, unregister)
};
