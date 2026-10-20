import { formAction } from '#lib/server/form-action.ts';
import { listWhitelist, addLogins, removeLogin } from '#lib/server/domain/whitelist.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return { whitelist: await listWhitelist(db, locals.user) };
};
export const actions: Actions = {
	add: (event) => formAction(event, addLogins, { notFound: 'error_whitelist_not_found' }),
	remove: (event) => formAction(event, removeLogin, { notFound: 'error_whitelist_not_found' })
};
