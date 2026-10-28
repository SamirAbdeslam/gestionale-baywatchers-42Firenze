import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { assertAdmin } from '#lib/server/auth/guards.ts';
import { formAction } from '#lib/server/form-action.ts';
import { createTemplate } from '#lib/server/domain/templates.ts';
import { readTemplateForm, emptyTemplateEvent, emptyTemplateForm } from '#lib/template-form.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	save: async (event) => {
		const { request, locals } = event;
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
		const result = await formAction(
			event,
			(db, actor, input, info, now) => {
				z.literal('save').parse(intent);
				return createTemplate(db, actor, input, info, now);
			},
			{ input: values }
		);
		if ('status' in result) return fail(result.status, { ...result.data, values });
		return { ...result, values: emptyTemplateForm() };
	}
};
