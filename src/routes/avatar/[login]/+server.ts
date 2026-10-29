import { eq } from 'drizzle-orm';
import { assertUser, loginPattern } from '#lib/server/auth/guards.ts';
import { users, whitelist } from '#lib/server/db/schema.ts';
import { avatarResponse } from '#lib/server/avatar.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	assertUser(locals.user);
	if (!loginPattern.test(params.login)) return new Response(null, { status: 404 });
	const own = params.login === locals.user.login;
	if (!own && locals.user.role !== 'admin') return new Response(null, { status: 404 });
	try {
		const { db } = await import('#lib/server/db/index.ts');
		// Admins may only fetch avatars of whitelisted logins.
		if (!own) {
			const [listed] = await db
				.select({ id: whitelist.id })
				.from(whitelist)
				.where(eq(whitelist.login, params.login));
			if (!listed) return new Response(null, { status: 404 });
		}
		const [user] = await db
			.select({ imageUrl: users.imageUrl })
			.from(users)
			.where(eq(users.login, params.login));
		return avatarResponse(user?.imageUrl);
	} catch {
		console.error('Avatar lookup failed');
		return new Response(null, { status: 404 });
	}
};
