import { afterEach, expect, it, vi } from 'vitest';
import {
	generateSessionToken,
	sessionId,
	cookieOptions
} from '../../src/lib/server/auth/session.ts';
import {
	assertAdmin,
	isPublicPath,
	matchesDisplayToken
} from '../../src/lib/server/auth/guards.ts';
import {
	generateState,
	profileSchema,
	oauthClient,
	AUTHORIZE_URL,
	fetchProfile
} from '../../src/lib/server/auth/oauth42.ts';
import { publish, subscribe } from '../../src/lib/server/realtime/bus.ts';
import type { User } from '../../src/lib/server/auth/session.ts';

afterEach(() => vi.unstubAllGlobals());
it('generates independent base32 tokens with exactly 160 bits and stores only a SHA256 id', () => {
	const first = generateSessionToken(),
		second = generateSessionToken();
	expect(first).toMatch(/^[a-z2-7]{32}$/);
	expect(first).not.toBe(second);
	expect(sessionId(first)).toMatch(/^[a-f0-9]{64}$/);
	expect(sessionId(first)).toBe(sessionId(first));
	expect(cookieOptions('https://localhost:8443')).toEqual({
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true
	});
	expect(cookieOptions('http://localhost:4173').secure).toBe(false);
});
it.each([
	'/',
	'/display',
	'/display/sub',
	'/auth/login',
	'/healthz',
	'/api/stream',
	'/_app/immutable/a.js'
])('recognizes public boundary %s', (path) => expect(isPublicPath(path)).toBe(true));
it.each([
	'/admin',
	'/calendar',
	'/profile',
	'/display-admin',
	'/authentication',
	'/healthz-private',
	'/api/streams',
	'/_application'
])('denies unrelated path %s', (path) => expect(isPublicPath(path)).toBe(false));
it('guards admin actors and checks display tokens without accepting prefixes', () => {
	expect(() => assertAdmin(null)).toThrow();
	expect(() => assertAdmin({ role: 'user' } as User)).toThrow();
	expect(() => assertAdmin({ role: 'admin' } as User)).not.toThrow();
	expect(matchesDisplayToken(null, '')).toBe(true);
	expect(matchesDisplayToken('secret', 'secret')).toBe(true);
	expect(matchesDisplayToken(null, 'secret')).toBe(false);
	expect(matchesDisplayToken('secretX', 'secret')).toBe(false);
	expect(matchesDisplayToken('secreX', 'secret')).toBe(false);
});
it('validates profile identity, defaults malformed optional fields and recalculates roles', () => {
	expect(
		profileSchema.parse({
			id: 42,
			login: ' IGILANI ',
			email: 1,
			displayname: false,
			image: null,
			wallet: '5',
			'staff?': 'true'
		})
	).toEqual({
		intraId: 42,
		login: 'igilani',
		email: '',
		displayName: 'igilani',
		imageUrl: '',
		wallet: 0,
		role: 'admin'
	});
	expect(profileSchema.parse({ id: 1, login: 'student', 'staff?': true }).role).toBe('admin');
	expect(profileSchema.parse({ id: 1, login: 'student', 'staff?': false }).role).toBe('user');
	expect(() => profileSchema.parse({ id: '1', login: 'student' })).toThrow();
	expect(() => profileSchema.parse({ id: 1, login: '<script>' })).toThrow();
});
it('uses the fixed 42 endpoints and validates mocked token and profile responses', async () => {
	const client = oauthClient({
		FT_CLIENT_ID: 'client',
		FT_CLIENT_SECRET: 'secret',
		ORIGIN: 'https://localhost:8443'
	});
	const url = client.authorizationUrl('random-state');
	expect(url.origin + url.pathname).toBe(AUTHORIZE_URL);
	expect(url.searchParams.get('redirect_uri')).toBe('https://localhost:8443/auth/callback');
	expect(url.searchParams.get('state')).toBe('random-state');
	expect(url.searchParams.get('scope')).toBe('public');
	expect(url.searchParams.get('response_type')).toBe('code');
	expect(url.searchParams.get('client_id')).toBe('client');
	const mocked = vi
		.fn()
		.mockResolvedValueOnce(Response.json({ access_token: 'test-token', token_type: 'bearer' }))
		.mockResolvedValueOnce(Response.json({ id: 42, login: 'student' }));
	vi.stubGlobal('fetch', mocked);
	expect((await fetchProfile(client, 'code')).login).toBe('student');
	const tokenRequest = mocked.mock.calls[0][0] as Request;
	expect(tokenRequest.url).toBe('https://api.intra.42.fr/oauth/token');
	expect(await tokenRequest.text()).toContain('grant_type=authorization_code');
	expect(mocked.mock.calls[1][0]).toBe('https://api.intra.42.fr/v2/me');
	expect(new Request(mocked.mock.calls[1][0], mocked.mock.calls[1][1]).redirect).toBe('error');
	expect(mocked.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer test-token' });
});
it('rejects unsuccessful provider responses', async () => {
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(new Response('provider unavailable', { status: 503 }))
	);
	await expect(
		fetchProfile(
			oauthClient({ FT_CLIENT_ID: 'id', FT_CLIENT_SECRET: 'secret', ORIGIN: 'http://localhost' }),
			'code'
		)
	).rejects.toThrow();
});
it('publishes only to active listeners and unsubscribes independently', () => {
	const one = vi.fn(),
		two = vi.fn(),
		unsubscribeOne = subscribe(one),
		unsubscribeTwo = subscribe(two);
	const event = { type: 'log_created' as const, id: 7 };
	publish(event);
	unsubscribeOne();
	publish(event);
	unsubscribeTwo();
	publish(event);
	expect(one).toHaveBeenCalledExactlyOnceWith(event);
	expect(two).toHaveBeenCalledTimes(2);
});

it('generates distinct 32-byte base64url OAuth states', () => {
	const state = generateState();
	expect(state).toHaveLength(43);
	expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
	expect(Buffer.from(state, 'base64url')).toHaveLength(32);
	expect(generateState()).not.toBe(state);
});
it.each([{}, null, { access_token: '' }, { access_token: 42 }])(
	'rejects an invalid token response %j before fetching a profile',
	async (body) => {
		const mocked = vi.fn().mockResolvedValue(Response.json(body));
		vi.stubGlobal('fetch', mocked);
		await expect(
			fetchProfile(
				oauthClient({
					FT_CLIENT_ID: 'id',
					FT_CLIENT_SECRET: 'secret',
					ORIGIN: 'https://localhost:8443'
				}),
				'code'
			)
		).rejects.toThrow();
		expect(mocked).toHaveBeenCalledTimes(1);
		const request = mocked.mock.calls[0][0] as Request;
		expect(request.method).toBe('POST');
		expect(request.redirect).toBe('error');
		expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
		expect(Object.fromEntries(new URLSearchParams(await request.text()))).toEqual({
			grant_type: 'authorization_code',
			code: 'code',
			redirect_uri: 'https://localhost:8443/auth/callback',
			client_id: 'id',
			client_secret: 'secret'
		});
	}
);

it('isolates a failing listener without throwing, leaking details or skipping other listeners', () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const healthy = vi.fn();
	const stopBroken = subscribe(() => {
		throw new Error('PRIVATE_LISTENER_DATA');
	});
	const stopHealthy = subscribe(healthy);
	const event = { type: 'log_created' as const, id: 7 };
	try {
		expect(() => publish(event)).not.toThrow();
		expect(healthy).toHaveBeenCalledExactlyOnceWith(event);
		expect(log).toHaveBeenCalledExactlyOnceWith('Realtime listener failed');
		expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_LISTENER_DATA');
	} finally {
		stopBroken();
		stopHealthy();
		log.mockRestore();
	}
});

it.each([
	[
		{
			link: 'https://cdn.intra.42.fr/full.jpg',
			versions: { medium: 'https://cdn.intra.42.fr/medium.jpg' }
		},
		'https://cdn.intra.42.fr/medium.jpg'
	],
	[{ link: 'https://cdn.intra.42.fr/full.jpg' }, 'https://cdn.intra.42.fr/full.jpg'],
	[
		{ link: 'https://cdn.intra.42.fr/full.jpg', versions: { medium: null } },
		'https://cdn.intra.42.fr/full.jpg'
	],
	[undefined, '']
])('prefers the medium avatar and safely handles optional image data %j', (image, expected) => {
	expect(profileSchema.parse({ id: 123, login: 'student', image }).imageUrl).toBe(expected);
});
