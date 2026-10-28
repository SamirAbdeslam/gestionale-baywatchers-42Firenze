<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { m } from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/format.ts';
	let { start, now }: { start: string; now: number } = $props();
	// The server computes midnight in Rome; browser timezone must not shift the start.
	let clock = $state<number | null>(null);
	let remaining = $derived(
		Math.max(0, Math.floor((new Date(start).getTime() - (clock ?? now)) / 60000))
	);
	onMount(() => {
		const timer = setInterval(() => {
			clock = Date.now();
			if (clock >= Date.parse(start)) {
				clearInterval(timer);
				void invalidate('app:calendar');
			}
		}, 1000);
		return () => clearInterval(timer);
	});
</script>

<section aria-labelledby="countdown-title">
	<h1 id="countdown-title">{m.recap_countdown()}</h1>
	<p class="countdown">
		{m.recap_remaining({
			days: formatNumber(Math.floor(remaining / 1440)),
			hours: formatNumber(Math.floor(remaining / 60) % 24),
			minutes: formatNumber(remaining % 60)
		})}
	</p>
</section>

<style>
	.countdown {
		font-family: var(--font-mono);
		font-size: var(--font-section);
		overflow-wrap: anywhere;
	}
</style>
