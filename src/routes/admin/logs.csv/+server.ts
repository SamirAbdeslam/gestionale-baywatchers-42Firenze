import { exportLogs } from '#lib/server/domain/logs.ts';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, url }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return new Response(await exportLogs(db, locals.user, Object.fromEntries(url.searchParams)), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="action_logs.csv"'
		}
	});
};
