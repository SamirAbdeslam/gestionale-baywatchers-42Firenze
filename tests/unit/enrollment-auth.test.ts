import { expect, it, vi } from 'vitest';
import { GET as startLogin } from '../../src/routes/auth/login/+server.ts';
import { GET as callback } from '../../src/routes/auth/callback/+server.ts';

vi.mock('#lib/server/env.ts', () => ({ readEnv: () => ({ ORIGIN: 'https://example.test' }) }));
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));
vi.mock('#lib/server/domain/auth.ts', () => ({
	login: async () => ({ token: 'test-session', expiresAt: new Date('2026-11-01T00:00:00Z') })
}));
vi.mock('#lib/server/auth/oauth42.ts', () => ({
	generateState: () => 'test-state',
	oauthClient: () => ({
		authorizationUrl: () => new URL('https://api.intra.42.fr/oauth/authorize?state=test-state')
	}),
	fetchProfile: async () => ({ id: 1, login: 'student' }),
	CampusAccessError: class CampusAccessError extends Error {}
}));
function event(path: string, values: Record<string, string> = {}) {
	const cookies = {
		get: (key: string) => values[key],
		set: vi.fn((key: string, value: string) => {
			values[key] = value;
		}),
		delete: vi.fn((key: string) => {
			delete values[key];
		})
	};
	return {
		url: new URL(path, 'https://example.test'),
		request: new Request('https://example.test'),
		cookies,
		getClientAddress: () => '127.0.0.1',
		locals: { user: null }
	};
}
it.each(['/join/test-code', '//evil.test', '/.//evil.test'])(
	'carries the same-site return target through OAuth cookies (%s)',
	async (target) => {
		const values: Record<string, string> = {};
		const start = event('/auth/login?' + new URLSearchParams({ to: target }), values);
		const response = await startLogin(start as unknown as Parameters<typeof startLogin>[0]);
		expect(response.status).toBe(303);
		expect(response.headers.get('Location')).toContain('https://api.intra.42.fr/');
		expect(values.oauth_state).toBe('test-state');
		const finish = event('/auth/callback?code=test-code&state=test-state', values);
		const expected =
			target === '//evil.test'
				? 'https://example.test/calendar'
				: new URL(target, 'https://example.test').href;
		await expect(
			callback(finish as unknown as Parameters<typeof callback>[0])
		).rejects.toMatchObject({ status: 303, location: expected });
		expect(finish.cookies.delete).toHaveBeenCalledWith('oauth_return_to', { path: '/' });
		expect(finish.cookies.set).toHaveBeenCalledWith(
			'session',
			'test-session',
			expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' })
		);
	}
);
it('revalidates an off-site return cookie at callback time', async () => {
	const finish = event('/auth/callback?code=test-code&state=test-state', {
		oauth_state: 'test-state',
		oauth_return_to: 'https://evil.test'
	});
	await expect(callback(finish as unknown as Parameters<typeof callback>[0])).rejects.toMatchObject(
		{ status: 303, location: '/calendar' }
	);
});
