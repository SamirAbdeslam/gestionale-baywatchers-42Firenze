<script module lang="ts">
	import { formatNumber } from '#lib/format.ts';
	import type { TemplateNotice } from '#lib/server/domain/templates.ts';
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
			| 'error_whitelist_not_found'
			| 'error_template_not_found';
		params: Record<string, never>;
	};
	export type Notice = BasicNotice | RegistrationNotice | WhitelistNotice | TemplateNotice;
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
		if (messages.every((message) => message.type === 'success')) {
			const timer = setTimeout(() => (expired = true), 6000);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if !expired && messages.length}
	<div class="notices">
		{#each messages as message, index (index)}
			{#if !closed.includes(index)}
				<p
					class="notice"
					data-type={message.type}
					role={message.type === 'error' ? 'alert' : 'status'}
				>
					{#if message.key === 'error_weekly_limit'}
						{translations.error_weekly_limit({
							count: formatNumber(message.params.count!)
						})}
					{:else}
						{m[message.key](message.params)}
					{/if}
					<button
						type="button"
						aria-label={translations.app_dismiss_message()}
						onclick={() => (closed = [...closed, index])}
						>{translations.app_dismiss_message()}</button
					>
				</p>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.notices {
		position: fixed;
		right: var(--space-lg);
		bottom: var(--space-lg);
		z-index: var(--layer-overlay);
		display: grid;
		gap: var(--space-sm);
		width: min(var(--toast-width), calc(100% - 2 * var(--space-md)));
	}
	:global(body:has(.template-footer)) .notices {
		bottom: calc(var(--control-height) * 3 + var(--space-lg));
	}
	@media (max-width: 767px) {
		.notices {
			right: var(--space-md);
			bottom: calc(var(--bottom-nav-height) + var(--space-sm));
		}
	}
	@media (max-width: 767px) {
		:global(body:has(.template-footer)) .notices {
			bottom: calc(var(--bottom-nav-height) + var(--control-height) * 3 + var(--space-sm));
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.notice {
			animation: notice-in 200ms ease-out;
		}
	}
	@keyframes notice-in {
		from {
			opacity: 0;
			transform: translateY(var(--space-sm));
		}
	}
	.notice {
		margin: 0;
		border: var(--border-width) solid currentColor;
		display: flex;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-md);
		border-radius: var(--radius);
		background: var(--color-ok-bg);
		color: var(--color-ok);
	}
	.notice::before {
		content: '✓';
		font-weight: 700;
	}
	.notice[data-type='warning'] {
		background: var(--color-warn-bg);
		color: var(--color-warn);
	}
	.notice[data-type='warning']::before {
		content: '!';
	}
	.notice[data-type='error'] {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}
	.notice[data-type='error']::before {
		content: '×';
	}
	.notice button {
		margin-inline-start: auto;
		min-height: var(--control-height-sm);
		background: transparent;
		color: inherit;
		border: var(--border-width) solid currentColor;
	}
</style>
