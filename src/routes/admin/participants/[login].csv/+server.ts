import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getParticipants, participantCsv } from '#lib/server/domain/reports.ts';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	const { db } = await import('#lib/server/db/index.ts');
	try {
		return new Response(participantCsv(await getParticipants(db, locals.user, params.login)), {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="partecipante_${params.login}.csv"`
			}
		});
	} catch (cause) {
		if (cause instanceof z.ZodError) error(400, m.error_invalid_input());
		throw cause;
	}
};
