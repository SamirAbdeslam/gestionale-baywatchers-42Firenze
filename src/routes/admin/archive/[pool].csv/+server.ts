import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { exportArchive } from '#lib/server/domain/archive.ts';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		const { startDate, csv } = await exportArchive(db, locals.user, { pool: params.pool });
		return new Response(csv, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="piscina_${startDate}.csv"`
			}
		});
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
