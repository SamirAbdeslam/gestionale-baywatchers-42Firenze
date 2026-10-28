import { readEnv } from '#lib/server/env.ts';
import { enrollmentAdmin, setEnrollment, reviewEnrollment } from '#lib/server/domain/enrollment.ts';
import { formAction } from '#lib/server/form-action.ts';
import { listWhitelist, addLogins, removeLogin } from '#lib/server/domain/whitelist.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { db } = await import('#lib/server/db/index.ts');
	depends('app:enrollment');
	return {
		enrollment: await enrollmentAdmin(db, locals.user, readEnv().ORIGIN),
		whitelist: await listWhitelist(db, locals.user)
	};
};
async function review(event: Parameters<Actions[string]>[0], decision?: 'approve' | 'reject') {
	const form = await event.request.formData();
	const single = form.get('single');
	const logins = single
		? [single]
		: form.getAll(form.get('all') === 'yes' ? 'allLogins' : 'logins');
	return formAction(event, reviewEnrollment, {
		input: {
			logins,
			decision: decision ?? form.get('decision')
		}
	});
}
export const actions: Actions = {
	enrollment: (event) => formAction(event, setEnrollment),
	review: (event) => review(event),
	approve: (event) => review(event, 'approve'),
	reject: (event) => review(event, 'reject'),
	add: (event) => formAction(event, addLogins, { notFound: 'error_whitelist_not_found' }),
	remove: (event) => formAction(event, removeLogin, { notFound: 'error_whitelist_not_found' })
};
