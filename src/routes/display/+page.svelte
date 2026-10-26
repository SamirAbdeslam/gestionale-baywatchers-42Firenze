<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import Logo from '#lib/components/Logo.svelte';
	import ParticipantBadge from '#lib/components/ParticipantBadge.svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import EventCard from '#lib/components/EventCard.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let clock = $state('');
	const formatter = new Intl.DateTimeFormat(getLocale(), {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		timeZone: 'Europe/Rome'
	});
	const reload = () => invalidate('app:display');
	onMount(() => {
		const close = listenRealtime(
			(event) => {
				if (event.type !== 'log_created') void reload();
			},
			reload,
			page.url.searchParams.get('token') ?? ''
		);
		const updateClock = () => (clock = formatter.format(new Date()));
		updateClock();
		const clockTimer = setInterval(updateClock, 1000);
		const timer = setInterval(reload, 60000);
		return () => {
			clearInterval(timer);
			clearInterval(clockTimer);
			close();
		};
	});
</script>

<svelte:head>
	<title>{m.display_title()} — {m.app_name()}</title>
	{#if data.redirectUrl}<meta
			http-equiv="refresh"
			content={`${data.redirectSeconds}; url=${data.redirectUrl}`}
		/>{/if}
</svelte:head>
<div class="screen">
	<div class="display-heading">
		<Logo compact />
		<h1>{m.calendar_week({ week: formatNumber(data.week) })}</h1>
		<span class="clock mono">{clock}</span>
	</div>
	<div class="display-grid" data-days={data.days.length}>
		{#each data.days as day (day.weekday)}
			<section aria-labelledby={`day-${day.weekday}`}>
				<h2 class="day-heading" id={`day-${day.weekday}`}>
					{weekdays[day.weekday - 1]()}{#if day.date}
						— {day.date}{/if}
				</h2>
				{#each data.events.filter((event) => event.weekday === day.weekday) as event (event.id)}
					<EventCard
						event={{ ...event, registeredCount: event.maxSlots - event.freeSlots }}
						headingLevel={3}
						orientation="vertical"
					>
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
							{#each event.participants as login (login)}<li>
									<ParticipantBadge {login} />
								</li>{/each}
						</ul>
					</EventCard>
				{:else}<p>{m.calendar_empty()}</p>{/each}
			</section>
		{/each}
	</div>
	<footer>● {m.calendar_live()}</footer>
</div>

<style>
	.display-heading {
		--logo-compact-width: var(--display-logo-width);
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-lg);
		margin-bottom: var(--space-lg);
	}
	.display-heading h1 {
		margin: 0;
	}
	.day-heading {
		font-size: 1.17em;
		letter-spacing: normal;
	}
	.clock {
		font-size: var(--font-display);
	}
	footer {
		color: var(--color-ok);
		border-top: var(--border-width) solid var(--color-border);
		margin-top: var(--space-lg);
		padding-top: var(--space-md);
	}

	.screen :global(.participant) {
		font-size: var(--font-size-body);
	}
	.screen {
		font-size: var(--font-size-body);
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
		color: var(--color-ok);
	}
	.full {
		color: var(--color-danger);
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
