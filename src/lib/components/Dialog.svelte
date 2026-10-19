<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let { label, title, children }: { label: string; title: string; children: Snippet } = $props();
	let dialog = $state<HTMLDialogElement>();
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

{#if ready}
	<button type="button" onclick={() => dialog?.showModal()}>{label}</button>
	<dialog bind:this={dialog} aria-label={title} onsubmit={() => dialog?.close()}>
		<h3>{title}</h3>
		{@render children()}
		<button type="button" onclick={() => dialog?.close()}>{m.admin_cancel()}</button>
	</dialog>
{:else}
	<details>
		<summary>{label}</summary>
		<p>{title}</p>
		{@render children()}
	</details>
{/if}

<style>
	dialog {
		max-width: calc(100% - var(--space-lg));
		border: var(--border-width) solid var(--color-text);
		border-radius: var(--radius);
		padding: var(--space-md);
	}
</style>
