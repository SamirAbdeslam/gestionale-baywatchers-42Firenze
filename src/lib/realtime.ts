import { z } from 'zod';

const week = z.number().int().min(1).max(4);
const id = z.number().int().positive();
export const realtimeEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('event_changed'),
		eventId: id.nullable(),
		week: week.nullable(),
		action: z.enum(['create', 'update', 'delete', 'bulk_delete'])
	}),
	z.object({ type: z.literal('week_activated'), week }),
	z.object({ type: z.literal('pool_closed') }),
	z.object({ type: z.literal('log_created'), id })
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export function listenRealtime(
	onEvent: (event: RealtimeEvent) => void,
	onReconnect: () => void,
	token?: string
) {
	const query = token === undefined ? '' : `?${new URLSearchParams({ token })}`;
	const source = new EventSource(`/api/stream${query}`);
	let opened = false;
	source.onopen = () => {
		if (opened) onReconnect();
		opened = true;
	};
	source.onmessage = (message) => {
		let data: unknown;
		try {
			data = JSON.parse(message.data);
		} catch {
			return;
		}
		const parsed = realtimeEventSchema.safeParse(data);
		if (parsed.success) {
			onEvent(parsed.data);
			// The layout uses the page's existing stream for the global closure dialog.
			if (parsed.data.type === 'pool_closed') window.dispatchEvent(new Event('pool_closed'));
		}
	};
	return () => source.close();
}
