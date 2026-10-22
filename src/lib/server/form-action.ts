import { fail, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import type { register } from './domain/registrations.ts';
import type { Notice } from '#lib/components/Toast.svelte';

type Result = {
	registeredEventId?: number;
	ok: boolean;
	messages: Notice[];
	status?: 400 | 403 | 404;
};
export async function formAction(
	event: RequestEvent,
	mutate: (...args: Parameters<typeof register>) => Promise<unknown>,
	options: {
		input?: unknown;
		success?:
			| 'admin_settings_saved'
			| 'admin_event_created'
			| 'admin_event_updated'
			| 'admin_events_deleted'
			| 'admin_event_deleted';
		notFound?: 'error_event_not_found' | 'error_whitelist_not_found' | 'error_template_not_found';
	} = {}
) {
	const { db } = await import('./db/index.ts');
	try {
		const result = await mutate(
			db,
			event.locals.user,
			options.input ?? Object.fromEntries(await event.request.formData()),
			{
				ipAddress: event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent')
			},
			new Date()
		);
		if (options.success)
			return {
				ok: true,
				messages: [{ type: 'success' as const, key: options.success, params: {} }]
			};
		const { status, ...data } = result as Result;
		return status ? fail(status, data) : data;
	} catch (cause) {
		if (cause instanceof z.ZodError || (options.notFound && isHttpError(cause, 404))) {
			const key =
				cause instanceof z.ZodError
					? cause.issues.every((issue) => issue.message === 'error_pool_end_before_start')
						? 'error_pool_end_before_start'
						: cause.issues.every((issue) => issue.message === 'error_event_date_weekday')
							? 'error_event_date_weekday'
							: 'error_invalid_input'
					: options.notFound!;
			return fail(cause instanceof z.ZodError ? 400 : 404, {
				ok: false,
				messages: [{ type: 'error' as const, key, params: {} }]
			});
		}
		throw cause;
	}
}
