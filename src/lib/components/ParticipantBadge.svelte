<script lang="ts">
	let {
		login,
		mine = false,
		absent = false
	}: { login: string; mine?: boolean; absent?: boolean } = $props();
</script>

<span class="participant" class:mine class:absent
	>@{#if mine}<strong>{login}</strong>{:else}{login}{/if}</span
>

<style>
	.participant {
		display: inline-flex;
		align-items: center;
		min-height: var(--badge-height);
		padding: var(--space-xs) var(--space-sm);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-pill);
		font: var(--font-tiny) var(--font-mono);
	}
	.mine {
		border-color: var(--color-signal);
		background: var(--color-signal);
		color: var(--color-on-signal);
		font-weight: 600;
	}
	.absent {
		border-style: dashed;
		text-decoration: line-through;
	}
</style>
