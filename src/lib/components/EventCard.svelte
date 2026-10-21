<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { EventKind } from '#lib/server/domain/kinds.ts';
	import { getLocale } from '#lib/paraglide/runtime.js';
	let {
		event,
		children
	}: {
		event: {
			title: string;
			kind: EventKind;
			startTime: string;
			endTime: string;
			date: string;
			compensation: number;
		};
		children: Snippet;
	} = $props();
</script>

<article aria-label={event.title} data-kind={event.kind}>
	<h4>{event.title}</h4>
	<p>{event.startTime}–{event.endTime}</p>
	{#if event.date}<p>{event.date}</p>{/if}
	<p>{new Intl.NumberFormat(getLocale()).format(event.compensation)} ₳</p>
	{@render children()}
</article>

<style>
	article {
		border: var(--border-width) solid var(--color-custom);
		border-radius: var(--radius);
		padding: var(--space-md);
		margin-block: var(--space-md);
	}
	article[data-kind='exam'] {
		border-color: var(--color-exam);
	}
	article[data-kind='icebreaker'] {
		border-color: var(--color-icebreaker);
	}
	article[data-kind='rush'] {
		border-color: var(--color-rush);
	}
	article[data-kind='cluster'] {
		border-color: var(--color-cluster);
	}
	article[data-kind='welcome'] {
		border-color: var(--color-welcome);
	}
</style>
