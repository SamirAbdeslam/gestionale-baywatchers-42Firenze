import { getParticipants, summaryCsv } from '#lib/server/domain/reports.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return new Response(summaryCsv(await getParticipants(db, locals.user)), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="partecipanti_sintetico.csv"'
		}
	});
};
