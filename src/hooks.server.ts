import { building } from '$app/env';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readEnv } from '#lib/server/env.ts';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

export const init: ServerInit = async () => {
	if (building) return;
	readEnv();
	const { db } = await import('#lib/server/db/index.ts');
	// shortcut: boot migrations assume one instance, use a one-off job before scaling out.
	await migrate(db, { migrationsFolder: 'drizzle' });
};

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		)
	);
