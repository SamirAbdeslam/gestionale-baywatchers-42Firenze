<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let { label, title, children }: { label: string; title: string; children: Snippet } = $props();
	const id = $props.id();
</script>

<button type="button" commandfor={id} command="show-modal">{label}</button>
<dialog {id} aria-label={title} onsubmit={(event) => event.currentTarget.close()}>
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
