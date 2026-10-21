import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { readEnv } from '#lib/server/env.ts';
import { matchesDisplayToken } from '#lib/server/auth/guards.ts';
import { subscribe, listenerCount } from '#lib/server/realtime/bus.ts';
import { realtimeEventSchema } from '#lib/realtime.ts';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';

// shortcut: cap connections at 500 per process; revisit admission control before scaling out.
const MAX_CONNECTIONS = 500;

export const GET: RequestHandler = ({ request, url, locals }) => {
	const query = z
		.object({ token: z.string().optional() })
		.parse(Object.fromEntries(url.searchParams));
	const display = query.token !== undefined;
	const admin = locals.user?.role === 'admin';
	if (
		!admin &&
		(display || !locals.user) &&
		!matchesDisplayToken(query.token ?? null, readEnv().DISPLAY_TOKEN)
	)
		error(404, m.error_not_found());
	if (listenerCount() >= MAX_CONNECTIONS) error(503, m.error_stream_busy());
	const encoder = new TextEncoder();
	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			if (request.signal.aborted) {
				controller.close();
				return;
			}
			const stop = subscribe((event) => {
				if (event.type === 'log_created' && (!admin || display)) return;
				// Strip unknown fields so transport payloads cannot carry participant or audit details.
				const data = realtimeEventSchema.parse(event);
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			});
			const ping = () => controller.enqueue(encoder.encode(': ping\n\n'));
			const timer = setInterval(ping, 25000);
			const abort = () => {
				cleanup();
				controller.close();
			};
			cleanup = () => {
				stop();
				clearInterval(timer);
				request.signal.removeEventListener('abort', abort);
			};
			request.signal.addEventListener('abort', abort, { once: true });
			ping();
		},
		cancel() {
			cleanup();
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};
