import { eq } from 'drizzle-orm';
import { assertUser, loginPattern } from '#lib/server/auth/guards.ts';
import { users } from '#lib/server/db/schema.ts';
import { avatarResponse } from '#lib/server/avatar.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	assertUser(locals.user);
	if (!loginPattern.test(params.login)) return new Response(null, { status: 404 });
	try {
		const { db } = await import('#lib/server/db/index.ts');
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
