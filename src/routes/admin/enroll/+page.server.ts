import { enrollmentAdmin } from '#lib/server/domain/enrollment.ts';
import { readEnv } from '#lib/server/env.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('app:enrollment');
	const { db } = await import('#lib/server/db/index.ts');
	return { enrollment: await enrollmentAdmin(db, locals.user, readEnv().ORIGIN) };
};
