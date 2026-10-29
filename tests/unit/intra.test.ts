import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	FT_CLIENT_ID: 'client',
	FT_CLIENT_SECRET: 'secret',
	AUTH_DEV_LOGIN: false
}));
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => env }));
let lookupIntraLogins: typeof import('../../src/lib/server/intra.ts').lookupIntraLogins;
const fetchMock = vi.fn<typeof fetch>();
const token = () => Response.json({ access_token: 'app-token', expires_in: 3600 });
const profile = (campus: number[]) =>
	Response.json({ campus_users: campus.map((campus_id) => ({ campus_id })) });
beforeEach(async () => {
	vi.resetModules();
	env.FT_CLIENT_ID = 'client';
	env.AUTH_DEV_LOGIN = false;
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	({ lookupIntraLogins } = await import('../../src/lib/server/intra.ts'));
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
const run = async (logins: string[]) => {
	vi.useFakeTimers();
	const promise = lookupIntraLogins(logins);
	await vi.runAllTimersAsync();
	return promise;
};

it('accepts only existing logins of campus 52', async () => {
	fetchMock
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(profile([1, 52]))
		.mockResolvedValueOnce(new Response(null, { status: 404 }))
		.mockResolvedValueOnce(profile([1]))
		.mockResolvedValueOnce(profile([]));
	expect([...(await run(['ok', 'ghost', 'other', 'nocampus']))]).toEqual([
		['ok', 'ok'],
		['ghost', 'missing'],
		['other', 'other_campus'],
		['nocampus', 'other_campus']
	]);
	const [url, init] = fetchMock.mock.calls[1];
	expect(String((url as Request).url)).toBe('https://api.intra.42.fr/v2/users/ok');
	expect((url as Request).headers.get('Authorization')).toBe('Bearer app-token');
	expect(init).toBeUndefined();
});
it('spaces sequential requests by at least 500 ms', async () => {
	fetchMock.mockResolvedValueOnce(token()).mockImplementation(async () => profile([52]));
	vi.useFakeTimers();
	const promise = lookupIntraLogins(['a', 'b', 'c']);
	await vi.advanceTimersByTimeAsync(0);
	expect(fetchMock).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(499);
	expect(fetchMock).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(1);
	expect(fetchMock).toHaveBeenCalledTimes(3);
	await vi.advanceTimersByTimeAsync(499);
	expect(fetchMock).toHaveBeenCalledTimes(3);
	await vi.runAllTimersAsync();
	await promise;
	expect(fetchMock).toHaveBeenCalledTimes(4);
});
it('retries after HTTP 429 and renews a rejected token once', async () => {
	fetchMock
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '1' } }))
		.mockResolvedValueOnce(new Response(null, { status: 401 }))
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(profile([52]));
	expect([...(await run(['a']))]).toEqual([['a', 'ok']]);
});
it('marks the rest unavailable on API errors, network failures and missing credentials', async () => {
	fetchMock
		.mockResolvedValueOnce(token())
		.mockResolvedValueOnce(new Response(null, { status: 500 }));
	expect([...(await run(['a', 'b']))]).toEqual([
		['a', 'unavailable'],
		['b', 'unavailable']
	]);
	expect(fetchMock).toHaveBeenCalledTimes(2);
	fetchMock.mockReset();
	vi.resetModules();
	({ lookupIntraLogins } = await import('../../src/lib/server/intra.ts'));
	fetchMock.mockRejectedValue(new Error('SECRET_DETAILS'));
	expect([...(await run(['a']))]).toEqual([['a', 'unavailable']]);
	env.FT_CLIENT_ID = '';
	fetchMock.mockReset();
	expect([...(await run(['a']))]).toEqual([['a', 'unavailable']]);
	expect(fetchMock).not.toHaveBeenCalled();
});
it('skips the API entirely with the local dev login', async () => {
	env.AUTH_DEV_LOGIN = true;
	expect([...(await run(['a', 'b']))]).toEqual([
		['a', 'ok'],
		['b', 'ok']
	]);
	expect(fetchMock).not.toHaveBeenCalled();
});
