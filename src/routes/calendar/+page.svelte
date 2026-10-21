<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EventCard from '#lib/components/EventCard.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const registered = $derived(data.events.find((event) => event.id === form?.registeredEventId));
</script>

<svelte:head><title>{m.nav_calendar()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_calendar()}</h1>
<nav class="weeks" aria-label={m.calendar_events()}>
	{#if data.week > 1}<a href="{resolve('/calendar')}?week={data.week - 1}"
			>{m.calendar_previous()}</a
		>{/if}
	<h2>{m.calendar_week({ week: formatNumber(data.week) })}</h2>
	{#if data.week < data.activeWeek}<a href="{resolve('/calendar')}?week={data.week + 1}"
			>{m.calendar_next()}</a
		>{/if}
</nav>
{#if registered}
	<Dialog label={m.calendar_add()} title={m.calendar_add()} open>
		<p>{registered.title}</p>
		{#if registered.googleUrl}<p>
				<a href={registered.googleUrl} target="_blank" rel="external noopener noreferrer"
					>{m.calendar_google()}</a
				>
			</p>{/if}
		<p>
			<a href={resolve('/events/[id]/calendar.ics', { id: String(registered.id) })}
				>{m.calendar_ics()}</a
			>
		</p>
	</Dialog>
{/if}
<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable calendar needs keyboard focus.) -->
<div class="calendar" role="region" aria-label={m.calendar_events()} tabindex="0">
	{#each data.days as day (day.weekday)}
		<section aria-labelledby={`day-${day.weekday}`}>
			<h3 id={`day-${day.weekday}`}>
				{weekdays[day.weekday - 1]()}{#if day.date}
					— {day.date}{/if}
			</h3>
			{#each data.events.filter((event) => event.weekday === day.weekday) as event (event.id)}
				<EventCard {event}>
					<p class:full={event.registeredCount >= event.maxSlots} class="capacity">
						{m.calendar_registered_count({
							count: formatNumber(event.registeredCount),
							slots: formatNumber(event.maxSlots)
						})}
					</p>
					<ul aria-label={m.calendar_participants()}>
						{#each event.participants as participant (participant.participantLogin)}
							<li class:absent={!participant.attended}>
								{#if participant.participantLogin === data.user?.login}
									<strong aria-label={m.calendar_your_registration()}
										>{participant.participantLogin}</strong
									>
									{#if event.state !== 'passed'}<form
											method="POST"
											action={`?/unregister&week=${data.week}`}
											use:enhance
										>
											<input type="hidden" name="id" value={event.id} /><button type="submit"
												>{m.calendar_unregister()}</button
											>
										</form>{/if}
								{:else}{participant.participantLogin}{/if}
								{#if !participant.attended}
									— {m.calendar_absent()}{/if}
							</li>
						{/each}
					</ul>
					{#if event.state === 'passed'}<p>{m.calendar_passed()}</p>
					{:else if event.state === 'full'}<p>{m.calendar_full()}</p>
					{:else}<form
							method="POST"
							action={`?/${event.state === 'registered' ? 'unregister' : 'register'}&week=${data.week}`}
							use:enhance
						>
							<input type="hidden" name="id" value={event.id} />
							<button type="submit"
								>{event.state === 'registered'
									? m.calendar_unregister()
									: m.calendar_register()}</button
							>
						</form>{/if}
				</EventCard>
			{:else}<p>{m.calendar_empty()}</p>{/each}
		</section>
	{/each}
</div>

<style>
	.weeks {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-md);
	}
	.calendar {
		display: flex;
		gap: var(--space-md);
		overflow-x: auto;
	}
	section {
		flex: 1 0 var(--calendar-day-width);
		min-width: 0;
	}
	.capacity {
		color: var(--color-icebreaker);
	}
	.full {
		color: var(--color-exam);
	}
	.absent {
		text-decoration: line-through;
	}
</style>
