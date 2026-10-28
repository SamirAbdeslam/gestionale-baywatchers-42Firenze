import { getLogs, logCategory } from '#lib/server/domain/logs.ts';
import { getLocale } from '#lib/paraglide/runtime.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ depends, locals, url }) => {
	depends('app:logs');
	const { db } = await import('#lib/server/db/index.ts');
	const logs = await getLogs(db, locals.user, Object.fromEntries(url.searchParams));
	const clock = new Intl.DateTimeFormat(getLocale(), {
		dateStyle: 'short',
		timeStyle: 'medium',
		timeZone: 'Europe/Rome'
	});
	return {
		...logs,
		rows: logs.rows.map((row) => ({
			...row,
			timestamp: clock.format(row.createdAt),
			category: logCategory(row.actionType)
		}))
	};
};
