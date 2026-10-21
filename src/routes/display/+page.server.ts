import { readEnv } from '#lib/server/env.ts';
import { getDisplay } from '#lib/server/domain/display.ts';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('app:display');
	const env = readEnv();
	const { db } = await import('#lib/server/db/index.ts');
	const data = await getDisplay(
		db,
		locals.user,
		Object.fromEntries(url.searchParams),
		env.DISPLAY_TOKEN,
		new Date()
	);
	return {
		...data,
		days: data.days.map((day) => ({ ...day, date: formatEventDate(day.date, getLocale()) })),
		events: data.events.map((event) => ({
			...event,
			date: formatEventDate(event.date, getLocale())
		})),
		redirectUrl: env.DISPLAY_REDIRECT_URL,
		redirectSeconds: env.DISPLAY_REDIRECT_SECONDS
	};
};
