import { redirect } from '@sveltejs/kit';
import { assertUser } from '#lib/server/auth/guards.ts';
import { invalidateSession } from '#lib/server/auth/session.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	assertUser(locals.user);
	const { db } = await import('#lib/server/db/index.ts');
	const token = cookies.get('session');
	if (token) await invalidateSession(db, token);
	cookies.delete('session', { path: '/' });
	redirect(303, '/');
};
