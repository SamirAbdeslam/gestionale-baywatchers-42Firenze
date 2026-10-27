import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { assertAdmin } from '#lib/server/auth/guards.ts';
import { closePool, preparePoolClosure } from '#lib/server/domain/pool.ts';
import { formAction } from '#lib/server/form-action.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	assertAdmin(locals.user);
	if (!url.searchParams.has('review')) return { choices: null, messages: [] };
	const input = Object.fromEntries(url.searchParams);
	delete input.review;
	try {
		return preparePoolClosure(locals.user, input);
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
export const actions: Actions = {
	closePool: (event) => formAction(event, closePool)
};
