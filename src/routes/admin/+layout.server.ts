import { readEnv } from '#lib/server/env.ts';
import { assertAdmin } from '#lib/server/auth/guards.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	assertAdmin(locals.user);
	const env = readEnv();
	const displayUrl = new URL('/display', env.ORIGIN);
	if (env.DISPLAY_TOKEN) displayUrl.searchParams.set('token', env.DISPLAY_TOKEN);
	return { displayUrl: displayUrl.toString() };
};
