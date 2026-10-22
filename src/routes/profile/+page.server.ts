import { getProfile } from '#lib/server/domain/reports.ts';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	const profile = await getProfile(db, locals.user);
	return {
		profile: {
			...profile,
			weeks: profile.weeks.map((week) => ({
				...week,
				events: week.events.map((event) => ({
					...event,
					formattedDate: formatEventDate(event.date, getLocale())
				}))
			}))
		}
	};
};
