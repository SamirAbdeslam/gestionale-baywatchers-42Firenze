import { json } from '@sveltejs/kit';
import { suggestLogins } from '#lib/server/domain/whitelist.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { db } = await import('#lib/server/db/index.ts');
	return json(await suggestLogins(db, locals.user, url.searchParams.get('q') ?? ''), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
};
