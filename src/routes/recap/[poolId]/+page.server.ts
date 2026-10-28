import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getRecap } from '#lib/server/domain/recap.ts';
import { m } from '#lib/paraglide/messages.js';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url, depends, params }) => {
	depends('app:recap');
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const whole =
			z
				.enum(['pool'])
				.optional()
				.parse(url.searchParams.get('view') ?? undefined) === 'pool';
		return { recap: await getRecap(db, locals.user, params.poolId, whole) };
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
