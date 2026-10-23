import { parseTheme } from '#lib/theme.ts';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import { assets, routes } from '$app/manifest';
import { error, redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { isPublicPath, matchesPath } from '#lib/server/auth/guards.ts';
import { validateSession, setSessionCookie } from '#lib/server/auth/session.ts';
import { building } from '$app/env';
import type { Handle, HandleServerError, ServerInit } from '@sveltejs/kit/hooks';
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

export const handle: Handle = async ({ event, resolve }) => {
	const env = readEnv();
	return paraglideMiddleware(event.request, async ({ request, locale }) => {
		const token = event.cookies.get('session');
		const theme = parseTheme(event.cookies.get('theme'));
		event.locals.user = null;
		if (token) {
			const { db } = await import('#lib/server/db/index.ts');
			const session = await validateSession(db, token, new Date());
			if (session) {
				event.locals.user = session.user;
				setSessionCookie(event.cookies, token, session.expiresAt, env.ORIGIN);
			} else event.cookies.delete('session', { path: '/' });
		}
		let path;
		try {
			path = posix.normalize(decodeURIComponent(event.url.pathname));
		} catch {
			error(400, m.error_invalid_input());
		}
		const routeId = event.route.id;
		const accessPath = routeId ?? path;
		if (matchesPath(accessPath, '/auth/dev') && !env.AUTH_DEV_LOGIN)
			error(404, m.error_not_found());
		const isStatic = assets.some((asset) => `/${asset.path}` === path);
		if (!isPublicPath(accessPath) && !isStatic) {
			if (!event.locals.user) {
				const route = routes.find((route) => route.id === routeId);
				if (event.request.method === 'GET' && !route?.endpoint) redirect(303, '/');
				error(401, m.error_unauthorized());
			}
			if (accessPath.startsWith('/admin') && event.locals.user.role !== 'admin')
				error(403, m.error_forbidden());
		}
		// Authenticated HTML and responses carrying session cookies must not enter shared caches.
		const response = await resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
						.replace('%theme.attribute%', theme ? `data-theme="${theme}"` : '')
			}
		);
		if (!response.headers.get('Content-Type')?.startsWith('text/event-stream'))
			response.headers.set('Cache-Control', 'private, no-store');
		return response;
	});
};

export const handleError: HandleServerError = ({ error, kind }) => {
	if (kind === 'app') return;
	if (kind === 'framework')
		return {
			message:
				error.status === 404
					? m.error_not_found()
					: error.status === 405
						? m.error_method_not_allowed()
						: m.error_invalid_input()
		};
	if (kind === 'validation') return { message: m.error_invalid_input() };
	const id = randomUUID();
	console.error('Request failed', id, error);
	return { message: m.error_internal(), id };
};
