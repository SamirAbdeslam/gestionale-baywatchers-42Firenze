import { fail, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { listWhitelist, addLogins, removeLogin } from '#lib/server/domain/whitelist.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return { whitelist: await listWhitelist(db, locals.user) };
};
async function save(event: RequestEvent, mutate: typeof addLogins) {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		return await mutate(
			db,
			event.locals.user,
			Object.fromEntries(await event.request.formData()),
			{
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent')
			},
			new Date()
		);
	} catch (cause) {
		if (cause instanceof z.ZodError || isHttpError(cause, 404))
			return fail(cause instanceof z.ZodError ? 400 : 404, {
				ok: false,
				messages: [
					{
						type: 'error' as const,
						key:
							cause instanceof z.ZodError
								? ('error_invalid_input' as const)
								: ('error_whitelist_not_found' as const),
						params: {}
					}
				]
			});
		throw cause;
	}
}
export const actions: Actions = {
	add: (event) => save(event, addLogins),
	remove: (event) => save(event, removeLogin)
};
