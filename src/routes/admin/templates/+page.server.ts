import { formAction } from '#lib/server/form-action.ts';
import {
	listTemplates,
	applyTemplate,
	deleteTemplate,
	importTemplates
} from '#lib/server/domain/templates.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return { templates: await listTemplates(db, locals.user) };
};
export const actions: Actions = {
	apply: (event) => formAction(event, applyTemplate, { notFound: 'error_template_not_found' }),
	delete: (event) => formAction(event, deleteTemplate, { notFound: 'error_template_not_found' }),
	importCsv: (event) => formAction(event, importTemplates)
};
