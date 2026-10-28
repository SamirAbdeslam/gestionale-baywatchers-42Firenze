import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { downloadIcs } from '#lib/server/domain/ics.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const result = await downloadIcs(db, locals.user, params.id, new Date());
		return new Response(result.content, {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': `attachment; filename="evento_${result.id}.ics"`
			}
		});
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
