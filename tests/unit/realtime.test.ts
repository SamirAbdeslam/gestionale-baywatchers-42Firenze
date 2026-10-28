import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listenRealtime } from '../../src/lib/realtime.ts';
import { publish, listenerCount } from '../../src/lib/server/realtime/bus.ts';
import { GET } from '../../src/routes/api/stream/+server.ts';
import type { User } from '../../src/lib/server/auth/session.ts';
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => ({ DISPLAY_TOKEN: expectedToken }) }));
let expectedToken = '';
const controllers: AbortController[] = [];
beforeEach(() => {
	expectedToken = '';
	vi.useFakeTimers();
});
afterEach(() => {
	for (const controller of controllers.splice(0)) controller.abort();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
async function open(role: 'user' | 'admin' | null = null, query = '', aborted = false, id = 1) {
	const controller = new AbortController();
	controllers.push(controller);
	if (aborted) controller.abort();
	const url = new URL('http://localhost/api/stream' + query);
	const response = await GET({
		request: new Request(url, { signal: controller.signal }),
		url,
		locals: { user: role ? ({ id, role } as User) : null }
	} as Parameters<typeof GET>[0]);
	return { response, reader: response.body!.getReader(), controller };
}
const decode = async (reader: ReadableStreamDefaultReader<Uint8Array>) =>
	new TextDecoder().decode((await reader.read()).value);
it('sets streaming headers, sends an immediate ping and then one every 25 seconds', async () => {
	const { response, reader } = await open();
	expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
	expect(response.headers.get('Cache-Control')).toBe('no-cache');
	expect(response.headers.get('X-Accel-Buffering')).toBe('no');
	expect(await decode(reader)).toBe(': ping\n\n');
	let received = false;
	const next = decode(reader).then((frame) => {
		received = true;
		return frame;
	});
	await vi.advanceTimersByTimeAsync(24999);
	expect(received).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	expect(await next).toBe(': ping\n\n');
	await reader.cancel();
	expect(vi.getTimerCount()).toBe(0);
});
it.each([null, 'user', 'admin'] as const)(
	'sends only public fields and restricts audit events (%s)',
	async (role) => {
		const { reader } = await open(role);
		await decode(reader);
		publish({
			type: 'event_changed',
			eventId: 12,
			week: 2,
			action: 'update',
			participantLogin: 'PRIVATE_LOGIN',
			token: 'PRIVATE_TOKEN'
		} as Parameters<typeof publish>[0]);
		expect(await decode(reader)).toBe(
			'data: {"type":"event_changed","eventId":12,"week":2,"action":"update"}\n\n'
		);
		publish({ type: 'pool_closed', participantLogin: 'PRIVATE_LOGIN' } as Parameters<
			typeof publish
		>[0]);
		expect(await decode(reader)).toBe('data: {"type":"pool_closed"}\n\n');
		publish({ type: 'log_created', id: 42 });
		publish({ type: 'week_activated', week: 3 });
		if (role === 'admin')
			expect(await decode(reader)).toBe('data: {"type":"log_created","id":42}\n\n');
		expect(await decode(reader)).toBe('data: {"type":"week_activated","week":3}\n\n');
	}
);
it.each([undefined, '', 'wrong', 'x'.repeat(24)])(
	'rejects anonymous missing or incorrect configured tokens (%s)',
	async (token) => {
		expectedToken = 'a'.repeat(24);
		const query = token === undefined ? '' : '?' + new URLSearchParams({ token });
		await expect(open(null, query)).rejects.toMatchObject({
			status: 404,
			body: { message: 'Pagina non trovata' }
		});
		expect(vi.getTimerCount()).toBe(0);
	}
);
it('accepts a display token, ordinary authenticated streams and admin bypass', async () => {
	expectedToken = 'a'.repeat(24);
	for (const [role, query] of [
		[null, '?token=' + expectedToken],
		['user', ''],
		['admin', '?token=wrong']
	] as const) {
		const { response, reader } = await open(role, query);
		expect(response.status).toBe(200);
		await reader.cancel();
	}
});
it('never sends log_created on the display stream even with an admin session', async () => {
	const { reader } = await open('admin', '?token=');
	await decode(reader);
	publish({ type: 'log_created', id: 99 });
	publish({ type: 'event_changed', eventId: null, week: null, action: 'update' });
	expect(await decode(reader)).toBe(
		'data: {"type":"event_changed","eventId":null,"week":null,"action":"update"}\n\n'
	);
});
it('removes subscriptions and timers when the request aborts or the reader cancels', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const first = await open(),
		second = await open();
	await decode(first.reader);
	await decode(second.reader);
	first.controller.abort();
	expect((await first.reader.read()).done).toBe(true);
	await second.reader.cancel();
	publish({ type: 'week_activated', week: 2 });
	expect(log).not.toHaveBeenCalled();
	expect(vi.getTimerCount()).toBe(0);
});
it('does not subscribe or schedule a heartbeat for an already aborted request', async () => {
	const { reader } = await open(null, '', true);
	expect((await reader.read()).done).toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});
it('supports more than ten simultaneous connections and closes them independently', async () => {
	const streams = await Promise.all(
		Array.from({ length: 20 }, (_, id) => open('user', '', false, id))
	);
	for (const stream of streams) await decode(stream.reader);
	await streams[0].reader.cancel();
	publish({ type: 'week_activated', week: 4 });
	for (const stream of streams.slice(1)) expect(await decode(stream.reader)).toContain('"week":4');
	for (const stream of streams.slice(1)) await stream.reader.cancel();
	expect(vi.getTimerCount()).toBe(0);
});
it.each(['user', 'admin', null] as const)(
	'limits each client to six streams and releases slots after cancel and abort (%s)',
	async (role) => {
		const query = role === null ? '?token=tv' : '';
		expectedToken = 'tv';
		const streams = await Promise.all(Array.from({ length: 6 }, () => open(role, query)));
		await expect(open(role, query)).rejects.toMatchObject({ status: 429 });
		expect(listenerCount()).toBe(6);
		expect(vi.getTimerCount()).toBe(6);
		const other = await open('user', '', false, 2);
		expect(other.response.status).toBe(200);
		await streams[0].reader.cancel();
		streams[0].controller.abort();
		streams[1].controller.abort();
		const replacements = await Promise.all([open(role, query), open(role, query)]);
		await expect(open(role, query)).rejects.toMatchObject({ status: 429 });
		for (const stream of [...streams.slice(2), ...replacements, other])
			await stream.reader.cancel();
		expect(listenerCount()).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	}
);
it('shares the display quota across anonymous and authenticated display streams', async () => {
	expectedToken = 'tv';
	for (let id = 0; id < 6; id++) await open('user', '?token=tv', false, id);
	await expect(open(null, '?token=tv')).rejects.toMatchObject({ status: 429 });
	await expect(open('admin', '?token=tv')).rejects.toMatchObject({ status: 429 });
	expect((await open('user')).response.status).toBe(200);
});
it('reserves the last 20 slots for admins and display and enforces the global cap', async () => {
	const streams = await Promise.all(
		Array.from({ length: 480 }, (_, id) => open('user', '', false, id))
	);
	await expect(open('user', '', false, 480)).rejects.toMatchObject({ status: 503 });
	const display = await open(null, '?token=');
	expect(display.response.status).toBe(200);
	const admins = await Promise.all(
		Array.from({ length: 19 }, (_, id) => open('admin', '', false, 500 + id))
	);
	expect(admins.every(({ response }) => response.status === 200)).toBe(true);
	expect(listenerCount()).toBe(500);
	await expect(open('admin', '', false, 600)).rejects.toMatchObject({ status: 503 });
	await expect(open(null, '?token=')).rejects.toMatchObject({ status: 503 });
	expect(listenerCount()).toBe(500);
	expect(vi.getTimerCount()).toBe(500);
	await streams[0].reader.cancel();
	const replacement = await open('admin', '', false, 600);
	expect(replacement.response.status).toBe(200);
	for (const stream of [...streams.slice(1), ...admins, display, replacement])
		await stream.reader.cancel();
	expect(listenerCount()).toBe(0);
	expect(vi.getTimerCount()).toBe(0);
});
class FakeSource {
	static instances: FakeSource[] = [];
	closed = false;
	onmessage: ((message: MessageEvent<string>) => void) | null = null;
	onopen: (() => void) | null = null;
	constructor(public url: string) {
		FakeSource.instances.push(this);
	}
	close() {
		this.closed = true;
	}
}
it('uses the native EventSource URL, validates messages and closes on cleanup', () => {
	vi.stubGlobal('EventSource', FakeSource);
	const handler = vi.fn();
	const close = listenRealtime(handler, () => {}, 'token &?');
	const source = FakeSource.instances.at(-1)!;
	expect(source.url).toBe('/api/stream?token=token+%26%3F');
	source.onmessage!(
		new MessageEvent('message', { data: '{"type":"week_activated","week":2,"private":"hidden"}' })
	);
	expect(handler).toHaveBeenCalledExactlyOnceWith({ type: 'week_activated', week: 2 });
	for (const data of [
		'not-json',
		'{"type":"week_activated","week":0}',
		'{"type":"week_activated","week":5}',
		'{}'
	])
		source.onmessage!(new MessageEvent('message', { data }));
	expect(handler).toHaveBeenCalledTimes(1);
	close();
	expect(source.closed).toBe(true);
});
it('omits the token query on authenticated page streams', () => {
	vi.stubGlobal('EventSource', FakeSource);
	const close = listenRealtime(
		() => {},
		() => {}
	);
	expect(FakeSource.instances.at(-1)!.url).toBe('/api/stream');
	close();
});
it('reloads on a reopened stream but not on its first successful open', () => {
	vi.stubGlobal('EventSource', FakeSource);
	const reload = vi.fn();
	const close = listenRealtime(() => {}, reload);
	const source = FakeSource.instances.at(-1)!;
	source.onopen!();
	expect(reload).not.toHaveBeenCalled();
	source.onopen!();
	expect(reload).toHaveBeenCalledTimes(1);
	source.onopen!();
	expect(reload).toHaveBeenCalledTimes(2);
	close();
});

it('notifies the layout of closure through the existing page stream', () => {
	vi.stubGlobal('EventSource', FakeSource);
	const target = new EventTarget();
	vi.stubGlobal('window', target);
	const closed = vi.fn();
	target.addEventListener('pool_closed', closed);
	const handler = vi.fn();
	const close = listenRealtime(handler, () => {});
	const source = FakeSource.instances.at(-1)!;
	source.onmessage!(
		new MessageEvent('message', { data: '{"type":"pool_closed","login":"private"}' })
	);
	expect(handler).toHaveBeenCalledExactlyOnceWith({ type: 'pool_closed' });
	expect(closed).toHaveBeenCalledTimes(1);
	close();
	expect(source.closed).toBe(true);
});
