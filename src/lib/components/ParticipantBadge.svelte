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
		padding: 0 var(--space-sm);
		max-width: 100%;
		min-width: 0;
		background: var(--color-raised);
		color: var(--color-text);
		border-radius: var(--radius-pill);
		font: 500 var(--font-small) var(--font-mono);
	}
	.mine {
		background: var(--color-signal);
		color: var(--color-on-signal);
		font-weight: 600;
	}
	.absent {
		color: var(--color-danger);
		background: var(--color-danger-bg);
		text-decoration: line-through;
	}
</style>
