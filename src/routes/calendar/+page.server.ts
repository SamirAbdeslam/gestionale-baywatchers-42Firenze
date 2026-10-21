import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { formAction } from '#lib/server/form-action.ts';
import { register, unregister } from '#lib/server/domain/registrations.ts';
import { getCalendar } from '#lib/server/domain/calendar.ts';
import { formatWeekDates } from '#lib/server/domain/dates.ts';
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
