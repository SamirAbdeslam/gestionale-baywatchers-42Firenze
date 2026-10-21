import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { assertAdmin } from '#lib/server/auth/guards.ts';
import { createTemplate } from '#lib/server/domain/templates.ts';
import { readTemplateForm, emptyTemplateEvent, emptyTemplateForm } from '#lib/template-form.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	save: async ({ request, locals, getClientAddress }) => {
		assertAdmin(locals.user);
		const form = await request.formData();
		const values = readTemplateForm(form);
		const intent = form.get('intent');
		if (intent === 'add') {
			values.events.push(emptyTemplateEvent());
			return { ok: true, messages: [], values };
		}
		if (typeof intent === 'string' && /^remove:\d+$/.test(intent)) {
			const index = Number(intent.slice(7));
			if (index < values.events.length) {
				values.events.splice(index, 1);
				return { ok: true, messages: [], values };
			}
		}
		try {
			z.literal('save').parse(intent);
			const { db } = await import('#lib/server/db/index.ts');
			const result = await createTemplate(
				db,
				locals.user,
				values,
				{ ipAddress: getClientAddress(), userAgent: request.headers.get('user-agent') },
				new Date()
			);
			return { ...result, values: emptyTemplateForm() };
		} catch (cause) {
			if (cause instanceof z.ZodError)
				return fail(400, {
					ok: false,
					messages: [{ type: 'error' as const, key: 'error_invalid_input' as const, params: {} }],
					values
				});
			throw cause;
		}
	}
};
