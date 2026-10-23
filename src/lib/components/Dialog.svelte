<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let {
		label,
		title,
		children,
		open = false,
		icon = false,
		closeLabel = m.admin_cancel()
	}: {
		label: string;
		title: string;
		children: Snippet;
		open?: boolean;
		icon?: boolean | 'add' | 'edit' | 'delete';
		closeLabel?: string;
	} = $props();
	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (open && dialog) {
			if (dialog.open) dialog.close();
			dialog.showModal();
		}
	});
	const id = $props.id();
</script>

<button
	hidden={open}
	class:icon-button={icon}
	type="button"
	commandfor={id}
	command="show-modal"
	aria-label={label}
>
	{#if icon}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
			{#if icon === 'add'}<path d="M12 4v16M4 12h16" />
			{:else if icon === 'edit'}<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />
			{:else if icon === 'delete'}<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
			{:else}<rect x="3" y="5" width="18" height="16" rx="2" /><path
					d="M3 10h18M8 3v4m8-4v4M9 15h6m-3-3v6"
				/>{/if}
		</svg>{:else}{label}{/if}</button
>
<dialog
	{id}
	{open}
	bind:this={dialog}
	aria-label={title}
	onsubmit={(event) => event.currentTarget.close()}
>
	<h3>{title}</h3>
	{@render children()}
	<button type="button" commandfor={id} command="close">{closeLabel}</button>
</dialog>

<style>
	dialog {
		--ticket-stub-width: var(--ticket-stub-dialog);
		width: var(--dialog-width);
		max-width: calc(100% - var(--space-lg));
		max-height: calc(100% - var(--space-lg));
		overflow: auto;
		color: var(--color-text);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		padding: var(--space-lg);
	}
	/* Without JavaScript the dialog opens with the open attribute, outside the top layer. */
	dialog[open]:not(:modal) {
		position: fixed;
		inset: 0;
		z-index: var(--layer-overlay);
	}
	dialog::backdrop {
		background: var(--color-backdrop);
	}
	dialog :global(form) {
		width: 100%;
	}
	@media (max-width: 767px) {
		dialog {
			margin: auto 0 0;
			max-width: 100%;
			width: 100%;
			border-radius: var(--radius-panel) var(--radius-panel) 0 0;
			padding: var(--space-lg) var(--space-md);
		}
		dialog::before {
			content: '';
			display: block;
			margin: calc(-1 * var(--space-md)) auto var(--space-md);
			width: var(--dialog-handle-width);
			height: var(--brand-bar);
			border-radius: var(--radius-pill);
			background: var(--color-border);
		}
	}
</style>
