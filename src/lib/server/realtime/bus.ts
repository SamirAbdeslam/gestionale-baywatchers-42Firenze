import { EventEmitter } from 'node:events';

import type { RealtimeEvent } from '#lib/realtime.ts';
export type { RealtimeEvent } from '#lib/realtime.ts';
// shortcut: in-process bus supports one instance; use Postgres LISTEN/NOTIFY before scaling out.
// Streams can have more than ten simultaneous subscribers.
const emitter = new EventEmitter().setMaxListeners(0);
export function publish(event: RealtimeEvent) {
	for (const listener of emitter.listeners('event')) {
		try {
			listener(event);
		} catch {
			console.error('Realtime listener failed');
		}
	}
}
export function subscribe(listener: (event: RealtimeEvent) => void) {
	emitter.on('event', listener);
	return () => {
		emitter.off('event', listener);
	};
}

export const listenerCount = () => emitter.listenerCount('event');
