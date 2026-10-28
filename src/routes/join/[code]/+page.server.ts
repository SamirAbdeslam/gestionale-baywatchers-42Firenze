import { getEnrollment, requestEnrollment } from '#lib/server/domain/enrollment.ts';
import { formAction } from '#lib/server/form-action.ts';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return { paramsCode: params.code, enrollment: await getEnrollment(db, params.code, locals.user) };
};
export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		return formAction(event, requestEnrollment, {
			input: { code: event.params.code, weeks: form.getAll('weeks') }
		});
	}
};
