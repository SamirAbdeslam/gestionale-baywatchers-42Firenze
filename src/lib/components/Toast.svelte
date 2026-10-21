<script module lang="ts">
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { WhitelistNotice } from '#lib/server/domain/whitelist.ts';
	import type { RegistrationNotice } from '#lib/server/domain/registrations.ts';
	import { m as translations } from '#lib/paraglide/messages.js';
	type BasicNotice = {
		type: 'success' | 'warning' | 'error';
		key:
			| 'admin_settings_saved'
			| 'admin_event_created'
			| 'admin_event_updated'
			| 'admin_event_deleted'
			| 'admin_events_deleted'
			| 'error_pool_end_before_start'
			| 'error_invalid_input'
			| 'error_event_date_weekday'
			| 'error_event_not_found'
			| 'error_whitelist_not_found';
		params: Record<string, never>;
	};
	export type Notice = BasicNotice | RegistrationNotice | WhitelistNotice;
	// Each notice carries the parameters required by its translation key.
	const m = translations as Record<Notice['key'], (params: Notice['params']) => string>;
</script>

<script lang="ts">
	let { messages = [] }: { messages?: Notice[] } = $props();
	let closed = $state<number[]>([]);
	let expired = $state(false);
	$effect(() => {
		closed = [];
		expired = messages.length === 0;
		const timer = setTimeout(() => (expired = true), 6000);
		return () => clearTimeout(timer);
	});
</script>

{#if !expired}
	{#each messages as message, index (index)}
		{#if !closed.includes(index)}
			<p role={message.type === 'error' ? 'alert' : 'status'}>
				{#if message.key === 'error_weekly_limit'}
					{translations.error_weekly_limit({
						count: new Intl.NumberFormat(getLocale()).format(message.params.count!)
					})}
				{:else}
					{m[message.key](message.params)}
				{/if}
				<button
					type="button"
					aria-label={translations.app_dismiss_message()}
					onclick={() => (closed = [...closed, index])}>{translations.app_dismiss_message()}</button
				>
			</p>
		{/if}
	{/each}
{/if}
