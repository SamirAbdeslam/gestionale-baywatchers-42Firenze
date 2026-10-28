import { assertAdmin } from '#lib/server/auth/guards.ts';
import { writeCsv } from '#lib/server/domain/csv.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ locals }) => {
	assertAdmin(locals.user);
	return new Response(
		writeCsv([['Week', 'Giorno', 'Orario', 'Tipo Evento', 'Compenso', 'Partecipanti']]),
		{
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': 'attachment; filename="template_esempio.csv"'
			}
		}
	);
};
