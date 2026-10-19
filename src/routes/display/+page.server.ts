import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { readEnv } from '#lib/server/env.ts';
import { matchesDisplayToken } from '#lib/server/auth/guards.ts';
import { m } from '#lib/paraglide/messages.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
	const query = z
		.object({ token: z.string().optional() })
		.safeParse(Object.fromEntries(url.searchParams));
	if (
		locals.user?.role !== 'admin' &&
		(!query.success || !matchesDisplayToken(query.data.token ?? null, readEnv().DISPLAY_TOKEN))
	)
		error(404, m.error_not_found());
};
