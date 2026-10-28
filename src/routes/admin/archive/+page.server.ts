import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { formAction } from '#lib/server/form-action.ts';
import { getArchive, previewPoolImport, importPool } from '#lib/server/domain/archive.ts';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		return await getArchive(db, locals.user, Object.fromEntries(url.searchParams));
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
export const actions: Actions = {
	preview: (event) => formAction(event, previewPoolImport),
	importCsv: (event) => formAction(event, importPool)
};
