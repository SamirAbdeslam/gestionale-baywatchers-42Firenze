import { readEnv } from '#lib/server/env.ts';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals }) => {
	const devLogin = readEnv().AUTH_DEV_LOGIN;
	if (!locals.user) return { user: null, devLogin };
	const { imageUrl, ...user } = locals.user;
	return { user: { ...user, hasImage: Boolean(imageUrl) }, devLogin };
};
