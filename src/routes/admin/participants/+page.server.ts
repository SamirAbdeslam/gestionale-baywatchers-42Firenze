import { getParticipants } from '#lib/server/domain/reports.ts';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	const participants = await getParticipants(db, locals.user);
	return {
		participants: participants.map((p) => ({
			...p,
			weeks: p.weeks.map((week) => ({
				...week,
				events: week.events.map((event) => ({
					...event,
					formattedDate: formatEventDate(event.date, getLocale())
				}))
			}))
		}))
	};
};
