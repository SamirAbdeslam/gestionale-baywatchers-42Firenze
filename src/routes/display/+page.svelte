<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import EventCard from '#lib/components/EventCard.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	onMount(() =>
		listenRealtime(
			(event) => {
				if (event.type !== 'log_created') void invalidate('app:display');
			},
			page.url.searchParams.get('token') ?? ''
		)
	);
</script>

<svelte:head>
	<title>{m.display_title()} — {m.app_name()}</title>
	{#if data.redirectUrl}<meta
			http-equiv="refresh"
			content={`${data.redirectSeconds}; url=${data.redirectUrl}`}
		/>{/if}
</svelte:head>
<div class="screen">
	<h1>{m.display_title()}</h1>
	<h2>{m.calendar_week({ week: formatNumber(data.week) })}</h2>
	<div class="display-grid" data-days={data.days.length}>
		{#each data.days as day (day.weekday)}
			<section aria-labelledby={`day-${day.weekday}`}>
				<h3 id={`day-${day.weekday}`}>
					{weekdays[day.weekday - 1]()}{#if day.date}
						— {day.date}{/if}
				</h3>
				{#each data.events.filter((event) => event.weekday === day.weekday) as event (event.id)}
					<EventCard {event}>
						<p class:full={event.state === 'full'} class="availability">
							{event.state === 'passed'
								? m.calendar_passed()
								: event.state === 'full'
									? m.calendar_full()
									: m.display_free_slots({
											count: formatNumber(event.freeSlots)
										})}
						</p>
						<ul aria-label={m.calendar_participants()}>
							{#each event.participants as login (login)}<li>{login}</li>{/each}
						</ul>
					</EventCard>
				{:else}<p>{m.calendar_empty()}</p>{/each}
			</section>
		{/each}
	</div>
</div>

<style>
	.screen {
		font-size: var(--font-display);
	}
	.display-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-md);
	}
	section {
		min-width: 0;
	}
	.availability {
		color: var(--color-icebreaker);
	}
	.full {
		color: var(--color-exam);
	}
	/* Keep numeric media queries aligned with --bp-md and --bp-lg. */
	@media (min-width: 768px) {
		.display-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 1200px) {
		.display-grid[data-days='5'] {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
		.display-grid[data-days='6'] {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
		.display-grid[data-days='7'] {
			grid-template-columns: repeat(7, minmax(0, 1fr));
		}
	}
</style>
