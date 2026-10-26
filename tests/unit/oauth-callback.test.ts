import { beforeEach, expect, it, vi } from 'vitest';
import { CampusAccessError } from '../../src/lib/server/auth/oauth42.ts';
import { GET } from '../../src/routes/auth/callback/+server.ts';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), login: vi.fn(), cookie: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => ({ ORIGIN: 'https://localhost:8443' }) }));
vi.mock('#lib/server/auth/oauth42.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../src/lib/server/auth/oauth42.ts')>()),
	oauthClient: () => ({}),
	fetchProfile: mocks.profile
}));
vi.mock('#lib/server/domain/auth.ts', () => ({ login: mocks.login }));
vi.mock('#lib/server/auth/session.ts', () => ({ setSessionCookie: mocks.cookie }));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.profile.mockReset().mockResolvedValue({ intraId: 42, login: 'student' });
	mocks.login
		.mockReset()
		.mockResolvedValue({ token: 'new-token', expiresAt: new Date('2026-11-15T00:00:00Z') });
});
function event(query: string, storedState?: string) {
	const url = new URL(`https://localhost:8443/auth/callback${query}`);
	return {
		url,
		request: new Request(url),
		cookies: {
			get: vi.fn((name: string) => (name === 'oauth_state' ? storedState : 'old-token')),
			delete: vi.fn()
		},
		getClientAddress: () => '127.0.0.1'
	} as unknown as Parameters<typeof GET>[0];
}
it('consumes state, persists identity and session, and redirects after successful mocked OAuth', async () => {
	const request = event('?code=code&state=state', 'state');
	await expect(GET(request)).rejects.toMatchObject({ status: 303, location: '/calendar' });
	expect(request.cookies.delete).toHaveBeenCalledWith('oauth_state', { path: '/' });
	expect(mocks.profile).toHaveBeenCalledExactlyOnceWith({}, 'code');
	expect(mocks.login).toHaveBeenCalledWith(
		{},
		{ profile: { intraId: 42, login: 'student' } },
		expect.objectContaining({ ipAddress: '127.0.0.1' }),
		expect.any(Date),
		'old-token'
	);
	expect(mocks.cookie).toHaveBeenCalledWith(
		request.cookies,
		'new-token',
		expect.any(Date),
		'https://localhost:8443'
	);
});
it.each([
	['?state=state', 'state'],
	['?code=code', 'state'],
	['?code=code&state=wrong', 'state'],
	['?code=code&state=state', undefined]
])('rejects invalid state before any provider or database call (%s)', async (query, stored) => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const request = event(query, stored);
		await expect(GET(request)).rejects.toMatchObject({
			status: 303,
			location: '/?error=login_failed'
		});
		expect(request.cookies.delete).toHaveBeenCalledWith('oauth_state', { path: '/' });
		expect(mocks.profile).not.toHaveBeenCalled();
		expect(mocks.login).not.toHaveBeenCalled();
	} finally {
		log.mockRestore();
	}
});
it('never includes token-bearing provider errors in application logs', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.profile.mockRejectedValueOnce(new Error('token=PRIVATE_TOKEN'));
	try {
		await expect(GET(event('?code=PRIVATE_CODE&state=state', 'state'))).rejects.toMatchObject({
			status: 303,
			location: '/?error=login_failed'
		});
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_CODE/);
		expect(mocks.cookie).not.toHaveBeenCalled();
	} finally {
		log.mockRestore();
	}
});

it('redirects rejected campuses without persistence, session cookies or application logs', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.profile.mockRejectedValueOnce(new CampusAccessError());
	try {
		await expect(GET(event('?code=code&state=state', 'state'))).rejects.toMatchObject({
			status: 303,
			location: '/?error=campus'
		});
		expect(mocks.login).not.toHaveBeenCalled();
		expect(mocks.cookie).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalled();
	} finally {
		log.mockRestore();
	}
});
