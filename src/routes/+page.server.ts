import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/calendar');
	const query = z
		.object({ error: z.enum(['login_failed', 'campus']).optional() })
		.safeParse(Object.fromEntries(url.searchParams));
	return {
		loginFailed: query.success && query.data.error === 'login_failed',
		campusDenied: query.success && query.data.error === 'campus'
	};
};
