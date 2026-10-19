import { readEnv } from '#lib/server/env.ts';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals }) => ({
	user: locals.user,
	devLogin: readEnv().AUTH_DEV_LOGIN
});
