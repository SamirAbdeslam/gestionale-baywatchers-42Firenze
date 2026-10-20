import { fail, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import type { register } from './domain/registrations.ts';

export async function registrationAction(event: RequestEvent, mutate: typeof register) {
	const { db } = await import('./db/index.ts');
	try {
		const result = await mutate(
			db,
			event.locals.user,
			Object.fromEntries(await event.request.formData()),
			{ ipAddress: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') },
			new Date()
		);
		const { status, ...data } = result;
		return status ? fail(status, data) : data;
	} catch (cause) {
		if (cause instanceof z.ZodError)
			return fail(400, {
				ok: false,
				messages: [{ type: 'error' as const, key: 'error_invalid_input' as const, params: {} }]
			});
		throw cause;
	}
}
