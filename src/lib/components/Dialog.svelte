<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let {
		label,
		title,
		children,
		open = false
	}: { label: string; title: string; children: Snippet; open?: boolean } = $props();
	let dialog = $state<HTMLDialogElement>();
	$effect(() => {
		if (open && dialog) {
			if (dialog.open) dialog.close();
			dialog.showModal();
		}
	});
	const id = $props.id();
</script>

<button type="button" commandfor={id} command="show-modal">{label}</button>
<dialog
	{id}
	{open}
	bind:this={dialog}
	aria-label={title}
	onsubmit={(event) => event.currentTarget.close()}
>
	<h3>{title}</h3>
	{@render children()}
	<button type="button" commandfor={id} command="close">{m.admin_cancel()}</button>
</dialog>

<style>
	dialog {
		max-width: calc(100% - var(--space-lg));
		border: var(--border-width) solid var(--color-text);
		border-radius: var(--radius);
		padding: var(--space-md);
	}
</style>
