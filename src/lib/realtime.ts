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
	z.object({ type: z.literal('log_created'), id })
]);
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export function listenRealtime(onEvent: (event: RealtimeEvent) => void, token?: string) {
	const query = token === undefined ? '' : `?${new URLSearchParams({ token })}`;
	const source = new EventSource(`/api/stream${query}`);
	const listeners = (['event_changed', 'week_activated', 'log_created'] as const).map((type) => {
		const listener = (message: Event) => {
			let data: unknown;
			try {
				data = JSON.parse((message as MessageEvent<string>).data);
			} catch {
				return;
			}
			const parsed = realtimeEventSchema.safeParse({ ...(data as object), type });
			if (parsed.success) onEvent(parsed.data);
		};
		source.addEventListener(type, listener);
		return { type, listener };
	});
	return () => {
		for (const { type, listener } of listeners) source.removeEventListener(type, listener);
		source.close();
	};
}
