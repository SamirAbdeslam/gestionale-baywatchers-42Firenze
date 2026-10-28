import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ FT_CLIENT_ID: 'client', FT_CLIENT_SECRET: 'secret' }));
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => env }));
let avatarResponse: typeof import('../../src/lib/server/avatar.ts').avatarResponse;
let tokens: typeof import('../../src/lib/server/auth/app-token.ts');
const fetchMock = vi.fn<typeof fetch>();
const cdn = 'https://cdn.intra.42.fr/users/test.jpg';
const token = (value = 'app-token', expires = 3600) =>
	Response.json({ access_token: value, expires_in: expires });
const image = () =>
	new Response(new Uint8Array([1, 2, 3]), {
		headers: {
			'Content-Type': 'image/jpeg',
			'Set-Cookie': 'CDN_PRIVATE_COOKIE',
			ETag: 'CDN_PRIVATE_ETAG'
		}
	});
beforeEach(async () => {
	vi.resetModules();
	env.FT_CLIENT_ID = 'client';
	env.FT_CLIENT_SECRET = 'secret';
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	({ avatarResponse } = await import('../../src/lib/server/avatar.ts'));
	tokens = await import('../../src/lib/server/auth/app-token.ts');
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it.each([
	null,
	'',
	'not-a-url',
	'http://cdn.intra.42.fr/test',
	'https://example.test/test',
	'https://cdn.intra.42.fr.example.test/test',
	'https://cdn.intra.42.fr:444/test',
	'https://user:password@cdn.intra.42.fr/test'
])('rejects untrusted avatar URL %s without network access', async (url) => {
	expect((await avatarResponse(url)).status).toBe(404);
	expect(fetchMock).not.toHaveBeenCalled();
});
it('returns only image bytes and our private caching/security headers', async () => {
	fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(image());
	const result = await avatarResponse(cdn);
	expect(result.status).toBe(200);
	expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1, 2, 3]);
	expect(Object.fromEntries(result.headers)).toEqual({
		'cache-control': 'private, max-age=86400',
		'content-type': 'image/jpeg',
		'x-content-type-options': 'nosniff',
		'content-security-policy': "default-src 'none'; frame-ancestors 'none'; sandbox"
	});
	const [url, options] = fetchMock.mock.calls[0];
	expect(url).toBe('https://api.intra.42.fr/oauth/token');
	expect(Object.fromEntries(options!.body as URLSearchParams)).toEqual({
		grant_type: 'client_credentials',
		client_id: 'client',
		client_secret: 'secret'
	});
	expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
	expect(options!.signal).toBeInstanceOf(AbortSignal);
	expect(fetchMock.mock.calls[1][1]).toMatchObject({
		redirect: 'error',
		headers: { Authorization: 'Bearer app-token' }
	});
});
it('rejects HTML and non-200 responses', async () => {
	fetchMock
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(
			new Response('private HTML', { headers: { 'Content-Type': 'text/html' } })
		)
		.mockResolvedValueOnce(new Response(null, { status: 302 }));
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect(fetchMock).toHaveBeenCalledTimes(3);
});
it('rejects oversized content-length before reading the image', async () => {
	const cancel = vi.fn();
	fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(
		new Response(new ReadableStream({ cancel }), {
			headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(2 * 1024 * 1024 + 1) }
		})
	);
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect(cancel).toHaveBeenCalledOnce();
});
it.each([undefined, '1'])(
	'limits streamed bytes even with missing or misleading content-length %s',
	async (length) => {
		const cancel = vi.fn();
		let sent = 0;
		const body = new ReadableStream({
			pull(controller) {
				controller.enqueue(new Uint8Array(1024 * 1024));
				if (++sent === 4) controller.close();
			},
			cancel
		});
		fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(
			new Response(body, {
				headers: { 'Content-Type': 'image/jpeg', ...(length ? { 'Content-Length': length } : {}) }
			})
		);
		expect((await avatarResponse(cdn)).status).toBe(404);
		expect(cancel).toHaveBeenCalledOnce();
	}
);
it('renews once after 401, without forwarding provider headers', async () => {
	fetchMock
		.mockResolvedValueOnce(token('old'))
		.mockResolvedValueOnce(new Response(null, { status: 401 }))
		.mockResolvedValueOnce(token('new'))
		.mockResolvedValueOnce(image());
	expect((await avatarResponse(cdn)).status).toBe(200);
	expect(fetchMock).toHaveBeenCalledTimes(4);
	expect(fetchMock.mock.calls[3][1]?.headers).toEqual({ Authorization: 'Bearer new' });
});
it('stops after a second 401', async () => {
	fetchMock
		.mockResolvedValueOnce(token('old'))
		.mockResolvedValueOnce(new Response(null, { status: 401 }))
		.mockResolvedValueOnce(token('new'))
		.mockResolvedValueOnce(new Response(null, { status: 401 }));
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect(fetchMock).toHaveBeenCalledTimes(4);
});
it('does not request either a token or an image without credentials', async () => {
	env.FT_CLIENT_SECRET = '';
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect(fetchMock).not.toHaveBeenCalled();
});
it('coalesces concurrent token requests and refreshes 60 seconds before expiry', async () => {
	let resolve!: (value: Response) => void;
	const now = vi.spyOn(Date, 'now').mockReturnValue(100000);
	fetchMock
		.mockImplementationOnce(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				})
		)
		.mockResolvedValueOnce(token('renewed'));
	const one = tokens.getAppToken(),
		two = tokens.getAppToken();
	expect(fetchMock).toHaveBeenCalledTimes(1);
	resolve(token('shared', 120));
	expect(await Promise.all([one, two])).toEqual(['shared', 'shared']);
	expect(await tokens.getAppToken()).toBe('shared');
	now.mockReturnValue(160000);
	expect(await tokens.getAppToken()).toBe('renewed');
	expect(fetchMock).toHaveBeenCalledTimes(2);
	tokens.invalidateAppToken('shared');
	expect(await tokens.getAppToken()).toBe('renewed');
});
it('forgets a failed in-flight token request and logs no provider exception details', async () => {
	fetchMock
		.mockRejectedValueOnce(new Error('Bearer PRIVATE_TOKEN client_secret=PRIVATE_SECRET'))
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(image());
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect((await avatarResponse(cdn)).status).toBe(200);
	expect(console.error).toHaveBeenCalledWith('Avatar request failed');
	expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(
		/PRIVATE_TOKEN|PRIVATE_SECRET/
	);
});
it.each([
	{ access_token: '', expires_in: 3600 },
	{ access_token: 'value' },
	{ access_token: 'value', expires_in: -1 }
])('rejects malformed app tokens %j', async (body) => {
	fetchMock.mockResolvedValueOnce(Response.json(body));
	expect((await avatarResponse(cdn)).status).toBe(404);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('has no filesystem imports in the avatar download or token modules', () => {
	for (const file of [
		'src/lib/server/avatar.ts',
		'src/lib/server/auth/app-token.ts',
		'src/routes/avatar/[login]/+server.ts'
	]) {
		expect(readFileSync(file, 'utf8')).not.toMatch(/['"](?:node:)?fs(?:\/promises)?['"]/);
	}
});
