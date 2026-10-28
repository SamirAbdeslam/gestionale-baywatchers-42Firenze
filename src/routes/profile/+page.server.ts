import { personalPools } from '#lib/server/domain/recap.ts';
import { getProfile, nextShift } from '#lib/server/domain/reports.ts';
import { formatEventDate } from '#lib/server/domain/dates.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:profile');
	const { db } = await import('#lib/server/db/index.ts');
	const now = new Date();
	const profile = await getProfile(db, locals.user, now);
	const shift = await nextShift(db, profile.user.login, now);
	const { imageUrl, ...user } = profile.user;
	return {
		pools: await personalPools(db, locals.user),
		nextShift: shift ? { ...shift, formattedDate: formatEventDate(shift.date, getLocale()) } : null,
		profile: {
			...profile,
			user: { ...user, hasImage: Boolean(imageUrl) },
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
