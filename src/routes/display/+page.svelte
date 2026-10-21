<script lang="ts">
	import EventCard from '#lib/components/EventCard.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const days = [
		m.weekday_1,
		m.weekday_2,
		m.weekday_3,
		m.weekday_4,
		m.weekday_5,
		m.weekday_6,
		m.weekday_7
	];
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
	<h2>{m.calendar_week({ week: new Intl.NumberFormat(getLocale()).format(data.week) })}</h2>
	<div class="display-grid" data-days={data.days.length}>
		{#each data.days as day (day.weekday)}
			<section aria-labelledby={`day-${day.weekday}`}>
				<h3 id={`day-${day.weekday}`}>
					{days[day.weekday - 1]()}{#if day.date}
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
											count: new Intl.NumberFormat(getLocale()).format(event.freeSlots)
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
