<script module lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	export type Notice = {
		type: 'success' | 'warning' | 'error';
		key:
			| 'admin_settings_saved'
			| 'admin_event_created'
			| 'admin_event_updated'
			| 'admin_event_deleted'
			| 'admin_events_deleted'
			| 'error_invalid_input'
			| 'error_event_not_found';
		params: Record<string, never>;
	};
</script>

<script lang="ts">
	let { messages = [] }: { messages?: Notice[] } = $props();
	let visible = $state(true);
	$effect(() => {
		visible = messages.length > 0;
		const timer = setTimeout(() => (visible = false), 6000);
		return () => clearTimeout(timer);
	});
</script>

{#if visible}
	{#each messages as message, index (index)}
		<p role={message.type === 'error' ? 'alert' : 'status'}>
			{m[message.key](message.params)}
			<button type="button" aria-label={m.app_dismiss_message()} onclick={() => (visible = false)}
				>{m.app_dismiss_message()}</button
			>
		</p>
	{/each}
{/if}
