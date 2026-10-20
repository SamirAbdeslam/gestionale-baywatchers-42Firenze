<script module lang="ts">
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { WhitelistNotice } from '#lib/server/domain/whitelist.ts';
	import type { RegistrationNotice } from '#lib/server/domain/registrations.ts';
	import { m } from '#lib/paraglide/messages.js';
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
			| 'error_event_not_found'
			| 'error_whitelist_not_found';
		params: Record<string, never>;
	};
	export type Notice = BasicNotice | RegistrationNotice | WhitelistNotice;
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
			{#if message.key === 'error_weekly_limit'}
				{m.error_weekly_limit({
					count: new Intl.NumberFormat(getLocale()).format(message.params.count)
				})}
			{:else if message.key === 'whitelist_added' || message.key === 'whitelist_duplicates' || message.key === 'whitelist_invalid' || message.key === 'whitelist_removed'}
				{m[message.key](message.params)}
			{:else if message.key === 'registration_added' || message.key === 'registration_removed' || message.key === 'registration_already_registered_login' || message.key === 'registration_present' || message.key === 'registration_absent'}
				{m[message.key](message.params)}
			{:else}
				{m[message.key](message.params)}
			{/if}
			<button type="button" aria-label={m.app_dismiss_message()} onclick={() => (visible = false)}
				>{m.app_dismiss_message()}</button
			>
		</p>
	{/each}
{/if}
