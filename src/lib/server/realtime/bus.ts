import { EventEmitter } from 'node:events';

export type RealtimeEvent =
	| {
			type: 'event_changed';
			eventId: number | null;
			week: number | null;
			action: 'create' | 'update' | 'delete' | 'bulk_delete';
	  }
	| { type: 'week_activated'; week: number }
	| { type: 'log_created'; id: number };
// shortcut: in-process bus supports one instance; use Postgres LISTEN/NOTIFY before scaling out.
const emitter = new EventEmitter();
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
