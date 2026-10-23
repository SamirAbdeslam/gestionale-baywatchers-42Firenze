import { afterEach, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, handleError } from '../../src/hooks.server.ts';

const state = vi.hoisted(() => ({
	dev: true,
	user: null as null | { role: string },
	expiresAt: new Date('2027-01-01T00:00:00Z')
}));
vi.mock('$app/manifest', () => ({
	assets: [{ path: '/badge.png' }],
	routes: [
		{ id: '/admin', page: true, endpoint: false },
		{ id: '/admin/logs.csv', page: false, endpoint: true },
		{ id: '/avatar/[login]', page: false, endpoint: true }
	]
}));
vi.mock('#lib/server/env.ts', () => ({
	readEnv: () => ({ AUTH_DEV_LOGIN: state.dev, ORIGIN: 'http://localhost:4173' })
}));
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));
vi.mock('#lib/server/auth/session.ts', () => ({
	validateSession: async () =>
		state.user ? { user: state.user, expiresAt: state.expiresAt } : null,
	setSessionCookie: vi.fn()
}));
afterEach(() => {
	state.dev = true;
	state.user = null;
	vi.restoreAllMocks();
});
function event(path: string, method = 'GET', token?: string) {
	const url = new URL(path, 'http://localhost:4173');
	const cookies = { get: vi.fn(() => token), delete: vi.fn(), set: vi.fn() };
	return {
		url,
		request: new Request(url, { method }),
		route: { id: path.split('?')[0] },
		locals: { user: null },
		cookies,
		isDataRequest: false
	} as unknown as RequestEvent;
}
it.each(['GET', 'POST'])('returns 404 for disabled dev login (%s)', async (method) => {
	state.dev = false;
	await expect(
		handle({ event: event('/auth/dev', method), resolve: vi.fn() })
	).rejects.toMatchObject({ status: 404 });
});
it('clears invalid session cookies and distinguishes pages from endpoints', async () => {
	const page = event('/admin', 'GET', 'invalid'),
		endpoint = event('/admin/logs.csv');
	await expect(handle({ event: page, resolve: vi.fn() })).rejects.toMatchObject({
		status: 303,
		location: '/'
	});
	expect(page.cookies.delete).toHaveBeenCalledWith('session', { path: '/' });
	await expect(handle({ event: endpoint, resolve: vi.fn() })).rejects.toMatchObject({
		status: 401
	});
});
it('rejects admin paths using the matched route and current database role', async () => {
	state.user = { role: 'user' };
	const request = event('/%61dmin', 'GET', 'token');
	request.route.id = '/admin';
	await expect(handle({ event: request, resolve: vi.fn() })).rejects.toMatchObject({ status: 403 });
});
it('resolves public pages with private caching and exposes only generic unexpected errors', async () => {
	const response = await handle({ event: event('/'), resolve: async () => new Response('ok') });
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const result = await handleError({
		error: new Error('private database details'),
		event: event('/'),
		kind: 'unknown'
	});
	expect(result).toMatchObject({ message: 'Errore interno', id: expect.any(String) });
	expect(JSON.stringify(result)).not.toContain('private database details');
	expect(log).toHaveBeenCalledTimes(1);
});

it.each([200, 404])(
	'limits the avatar browser cache exception to successful responses (%s)',
	async (status) => {
		state.user = { role: 'user' };
		const request = event('/avatar/student', 'GET', 'valid-token');
		request.route.id = '/avatar/[login]';
		const response = await handle({
			event: request,
			resolve: async () =>
				new Response(null, { status, headers: { 'Cache-Control': 'private, max-age=86400' } })
		});
		expect(response.headers.get('Cache-Control')).toBe(
			status === 200 ? 'private, max-age=86400' : 'private, no-store'
		);
	}
);
it('protects avatar endpoints with 401 rather than a page redirect', async () => {
	const request = event('/avatar/student');
	request.route.id = '/avatar/[login]';
	const resolve = vi.fn();
	const response = await handle({ event: request, resolve });
	expect(response.status).toBe(401);
	expect(response.headers.get('Cache-Control')).toBe('private, no-store');
	expect(resolve).not.toHaveBeenCalled();
});
