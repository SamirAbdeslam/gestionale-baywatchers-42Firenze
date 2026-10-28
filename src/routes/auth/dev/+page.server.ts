import { sameSiteRedirect } from '#lib/server/auth/guards.ts';
import { asc } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { users } from '#lib/server/db/schema.ts';
import { readEnv } from '#lib/server/env.ts';
import { login, devLoginSchema } from '#lib/server/domain/auth.ts';
import { setSessionCookie } from '#lib/server/auth/session.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	if (!readEnv().AUTH_DEV_LOGIN) error(404, m.error_not_found());
	const { db } = await import('#lib/server/db/index.ts');
	return {
		users: await db
			.select({ id: users.id, login: users.login, role: users.role })
			.from(users)
			.orderBy(asc(users.login))
	};
};
export const actions: Actions = {
	default: async (event) => {
		const env = readEnv();
		if (!env.AUTH_DEV_LOGIN) error(404, m.error_not_found());
		const result = devLoginSchema.safeParse(Object.fromEntries(await event.request.formData()));
		if (!result.success) return fail(400, { message: m.error_invalid_input() });
		const { db } = await import('#lib/server/db/index.ts');
		const session = await login(
			db,
			{ dev: result.data },
			{ ipAddress: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') },
			new Date(),
			event.cookies.get('session')
		);
		setSessionCookie(event.cookies, session.token, session.expiresAt, env.ORIGIN);
		redirect(303, sameSiteRedirect(event.url.searchParams.get('to'), env.ORIGIN), {
			external: [env.ORIGIN]
		});
	}
};
