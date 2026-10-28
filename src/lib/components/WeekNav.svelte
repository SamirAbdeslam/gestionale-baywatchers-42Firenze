<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/format.ts';
	let { week, activeWeek }: { week: number; activeWeek: number } = $props();
</script>

<nav class="weeks" aria-label={m.calendar_weeks()}>
	{#each Array.from({ length: Math.max(4, activeWeek) }, (_, i) => i + 1) as value (value)}
		{#snippet chip()}
			<span class="code">W{String(value).padStart(2, '0')}</span>
			<span class="week-state"
				>{value < activeWeek
					? m.week_closed()
					: value === activeWeek
						? m.week_active()
						: m.week_unopened()}</span
			>
		{/snippet}
		{#if value > activeWeek}<span class="week unopened">{@render chip()}</span>
		{:else}<a
				class="week"
				class:active={value === activeWeek}
				href="{resolve('/calendar')}?week={value}"
				aria-current={value === week ? 'page' : undefined}
				>{@render chip()}<span class="sr-only"
					>{value === week - 1
						? m.calendar_previous()
						: value === week + 1
							? m.calendar_next()
							: m.calendar_week({ week: formatNumber(value) })}</span
				></a
			>{/if}
	{/each}
</nav>

<style>
	.weeks {
		display: flex;
		gap: var(--space-sm);
		overflow-x: auto;
		max-width: 100%;
	}
	.week {
		display: flex;
		flex-direction: column;
		justify-content: center;
		flex: 0 0 var(--week-chip-width);
		min-height: var(--week-chip-height);
		padding: var(--space-sm) var(--space-md);
		border: var(--border-strong) solid var(--color-border);
		border-radius: var(--radius-field);
		text-decoration: none;
		font-size: var(--font-mono-sm);
		font-weight: 700;
	}
	.code {
		font: var(--font-small) var(--font-mono);
		color: var(--color-muted);
	}
	.active {
		background: var(--color-surface);
		border-color: var(--color-signal);
	}
	.active .code {
		color: var(--color-signal-text);
	}
	[aria-current] {
		outline: var(--border-width) solid var(--color-text);
		outline-offset: calc(-1 * var(--space-xs));
	}
	.unopened {
		color: var(--color-muted);
		border-style: dashed;
	}
	@media (max-width: 767px) {
		.weeks {
			width: 100%;
		}
		.week {
			align-items: center;
		}
		.week > .week-state {
			display: none;
		}
		.week {
			flex-basis: var(--week-mobile-width);
			padding: var(--space-sm);
		}
	}
</style>
