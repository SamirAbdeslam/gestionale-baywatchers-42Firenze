<script module lang="ts">
	import { formatNumber } from '#lib/format.ts';
	import type { ArchiveNotice } from '#lib/server/domain/archive.ts';
	import type { PoolNotice } from '#lib/server/domain/pool.ts';
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
	export type Notice =
		| BasicNotice
		| RegistrationNotice
		| WhitelistNotice
		| TemplateNotice
		| PoolNotice
		| ArchiveNotice;
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
		if (messages.some((message) => message.type === 'success')) {
			const timer = setTimeout(() => (expired = true), 4000);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if messages.length}
	<div class="notices">
		{#each messages as message, index (index)}
			{#if !closed.includes(index) && !(expired && message.type === 'success')}
				<div class="notice-wrapper" role={message.type === 'error' ? 'alert' : 'status'}>
					<details class="notice" data-type={message.type} open>
						<!-- svelte-ignore a11y_no_redundant_roles (Expose the native disclosure consistently as a dismiss button.) -->
						<summary
							role="button"
							aria-label={translations.app_dismiss_message()}
							onclick={() => (closed = [...closed, index])}>×</summary
						>
						<p>
							{#if message.key === 'error_weekly_limit'}
								{translations.error_weekly_limit({
									count: formatNumber(message.params.count!)
								})}
							{:else}
								{m[message.key](message.params)}
							{/if}
						</p>
					</details>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.notices {
		position: fixed;
		right: var(--space-md);
		top: calc(var(--brand-bar) + var(--header-height) + var(--space-sm));
		z-index: var(--layer-overlay);
		display: grid;
		gap: var(--space-sm);
		width: min(var(--toast-width), calc(100% - 2 * var(--space-md)));
	}
	@media (max-width: 767px) {
		.notices {
			top: calc(var(--brand-bar) + var(--header-mobile-height) + var(--space-sm));
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
			transform: translateY(calc(-1 * var(--space-sm)));
		}
	}
	.notice {
		margin: 0;
		border: var(--border-width) solid currentColor;
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-field);
		font-size: var(--font-label);
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
	.notice-wrapper:not(:has([open])) {
		display: none;
	}
	.notice::details-content {
		display: contents;
	}
	.notice p {
		margin: 0;
		min-width: 0;
		flex: 1;
	}
	.notice summary::-webkit-details-marker {
		display: none;
	}
	.notice summary {
		order: 1;
		list-style: none;
		display: grid;
		place-items: center;
		cursor: pointer;
		margin-inline-start: auto;
		min-height: var(--message-close-size);
		width: var(--message-close-size);
		flex: none;
		padding: 0;
		background: transparent;
		color: inherit;
		border: var(--border-width) solid currentColor;
	}
</style>
