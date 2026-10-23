<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { captureTicket, animateTicket } from '#lib/ticket-animation.ts';
	import type { SubmitFunction } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import ParticipantBadge from '#lib/components/ParticipantBadge.svelte';
	import { calendarTotals } from '#lib/calendar-view.ts';
	import EventCard from '#lib/components/EventCard.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();

	const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
	let ready = $state(false);
	let selectedDay = $state(1);
	$effect(() => {
		if (!data.days.some((day) => day.weekday === selectedDay))
			selectedDay = data.days[0]?.weekday ?? 1;
	});
	const totals = $derived(calendarTotals(data.events, data.user?.login ?? ''));
	const registered = $derived(data.events.find((event) => event.id === form?.registeredEventId));
	let activated = $state<{ week: number } | null>(null);
	let busy = $state(false);
	const animationLifetime = new AbortController();
	onDestroy(() => animationLifetime.abort());
	let pendingReload = false;
	const reload = () => {
		if (busy) {
			pendingReload = true;
			return Promise.resolve();
		}
		return invalidate('app:calendar');
	};
	const animateRegistration: SubmitFunction = ({ formElement, cancel, action }) => {
		if (busy) {
			cancel();
			return;
		}
		const snapshot = captureTicket(formElement);
		const take = action.searchParams.has('/register');
		busy = true;
		return async ({ result, update }) => {
			try {
				if (animationLifetime.signal.aborted) return;
				if (result.type === 'success' && result.data?.ok)
					await animateTicket(snapshot, take, () => update(), animationLifetime.signal);
				else await update();
			} finally {
				busy = false;
				if (pendingReload && !animationLifetime.signal.aborted) {
					pendingReload = false;
					void reload();
				}
			}
		};
	};
	onMount(() => {
		ready = true;
		return listenRealtime((event) => {
			if (event.type === 'log_created') return;
			if (event.type === 'week_activated') activated = { week: event.week };
			void reload();
		}, reload);
	});
</script>

<svelte:head><title>{m.nav_calendar()} — {m.app_name()}</title></svelte:head>
<div class="calendar-stage">
	<div class="calendar-heading">
		{#if data.days[0]?.date}<p class="calendar-period">
				{data.week === data.activeWeek ? m.week_active() : m.week_closed()} · {data.days[0].date} – {data.days.at(
					-1
				)?.date}
			</p>{/if}
		<h1>{m.calendar_week({ week: formatNumber(data.week) })}</h1>
		<section class="shift-counter" aria-label={m.calendar_your_shifts()}>
			<h2>{m.calendar_your_shifts()}</h2>
			<div class="counter-values">
				{#if data.maxEventsPerUser > 0 && data.maxEventsPerUser <= 10}<div
						class="counter-seats"
						aria-hidden="true"
					>
						{#each Array.from({ length: data.maxEventsPerUser }, (_, i) => i) as i (i)}<span
								class="counter-seat"
								class:own={i < totals.count}
								data-counter-slot={i}
							></span>{/each}
					</div>{/if}
				<span class="mono" data-counter-value
					>{formatNumber(totals.count)}{data.maxEventsPerUser > 0
						? `/${formatNumber(data.maxEventsPerUser)}`
						: ''} · {formatNumber(totals.compensation)} ₳</span
				>
			</div>
		</section>
		<WeekNav week={data.week} activeWeek={data.activeWeek} />
	</div>
	{#if registered}
		<Dialog
			label={m.calendar_add()}
			title={m.ticket_taken_title()}
			closeLabel={m.dialog_close()}
			open
		>
			<p class="confirmation">✓ {m.ticket_confirmed()}</p>
			<EventCard event={registered} orientation="horizontal" mine={false} />
			{#if registered.googleUrl}<p>
					<a
						class="button"
						href={registered.googleUrl}
						target="_blank"
						rel="external noopener noreferrer">{m.calendar_google()}</a
					>
				</p>{/if}
			<p>
				<a
					class="button secondary"
					href={resolve('/events/[id]/calendar.ics', { id: String(registered.id) })}
					>{m.calendar_ics()}</a
				>
			</p>
		</Dialog>
	{/if}
	{#if activated}
		{#key activated}
			<Dialog
				label={m.calendar_week_activated({ week: formatNumber(activated.week) })}
				title={m.calendar_week_activated({ week: formatNumber(activated.week) })}
				closeLabel={m.dialog_ok()}
				open
			>
				<p>{m.calendar_week_activated({ week: formatNumber(activated.week) })}</p>
			</Dialog>
		{/key}
	{/if}
	{#if ready}
		<div class="day-tabs" role="tablist" aria-label={m.calendar_days()}>
			{#each data.days as day, index (day.weekday)}
				<button
					type="button"
					role="tab"
					class:today={day.isoDate !== null && day.isoDate === today}
					id={`tab-${day.weekday}`}
					aria-controls={`panel-${day.weekday}`}
					aria-selected={selectedDay === day.weekday}
					tabindex={selectedDay === day.weekday ? 0 : -1}
					onclick={() => (selectedDay = day.weekday)}
					onkeydown={(event) => {
						let next: number;
						if (event.key === 'ArrowRight') next = (index + 1) % data.days.length;
						else if (event.key === 'ArrowLeft')
							next = (index - 1 + data.days.length) % data.days.length;
						else if (event.key === 'Home') next = 0;
						else if (event.key === 'End') next = data.days.length - 1;
						else return;
						event.preventDefault();
						selectedDay = data.days[next].weekday;
						document.getElementById(`tab-${selectedDay}`)?.focus();
					}}
				>
					<span>{weekdays[day.weekday - 1]().slice(0, 3)}</span><span class="day-number"
						>{day.date.split(' ')[0]}</span
					>
					{#if data.events.some((event) => event.weekday === day.weekday && event.isRegistered)}<span
							class="own-day"
							aria-hidden="true"
						></span>{/if}
				</button>
			{/each}
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable calendar needs keyboard focus.) -->
	<div class="calendar" role="region" aria-label={m.calendar_events()} tabindex="0">
		{#each data.days as day (day.weekday)}
			<section
				id={`panel-${day.weekday}`}
				class:inactive={ready && selectedDay !== day.weekday}
				aria-labelledby={`day-${day.weekday}`}
			>
				<h3 class:today={day.isoDate !== null && day.isoDate === today} id={`day-${day.weekday}`}>
					{#if day.date}<span class="day-number">{day.date.split(' ')[0]}</span>{/if}<span
						>{weekdays[day.weekday - 1]()}</span
					>{#if day.isoDate !== null && day.isoDate === today}<small>{m.calendar_today()}</small
						>{/if}
				</h3>
				{#each data.events.filter((event) => event.weekday === day.weekday) as event (event.id)}
					<EventCard event={{ ...event, date: '' }} mine={event.isRegistered}>
						<p
							class:own={event.isRegistered}
							class:full={event.registeredCount >= event.maxSlots}
							class="capacity"
						>
							{m.calendar_registered_count({
								count: formatNumber(event.registeredCount),
								slots: formatNumber(event.maxSlots)
							})}
							{#if event.isRegistered}
								· {m.calendar_inside()}{:else if event.state === 'available'}
								· {m.display_free_slots({
									count: formatNumber(event.maxSlots - event.registeredCount)
								})}{/if}
						</p>
						<ul aria-label={m.calendar_participants()}>
							{#each event.participants as participant (participant.participantLogin)}
								<li>
									<ParticipantBadge
										login={participant.participantLogin}
										mine={participant.participantLogin === data.user?.login}
										absent={!participant.attended}
									/>{#if !participant.attended}<span class="sr-only">{m.calendar_absent()}</span
										>{/if}
								</li>
							{/each}
						</ul>
						{#if event.state === 'passed'}<p>{m.calendar_passed()}</p>
						{:else if event.state === 'full'}<button type="button" disabled
								>{m.calendar_full()}</button
							>
						{:else}<div class="ticket-actions">
								<form
									method="POST"
									action={`?/${event.state === 'registered' ? 'unregister' : 'register'}&week=${data.week}`}
									use:enhance={animateRegistration}
								>
									<input type="hidden" name="id" value={event.id} />
									<button class:danger={event.state === 'registered'} type="submit" disabled={busy}
										>{event.state === 'registered'
											? m.calendar_unregister()
											: m.calendar_register()}</button
									>
								</form>
								{#if event.isRegistered && event.state !== 'passed'}
									<Dialog
										label={m.calendar_add()}
										title={m.calendar_add()}
										closeLabel={m.dialog_close()}
										icon
									>
										<EventCard {event} orientation="horizontal" mine={false} />
										{#if event.googleUrl}<p>
												<a
													class="button"
													href={event.googleUrl}
													target="_blank"
													rel="external noopener noreferrer">{m.calendar_google()}</a
												>
											</p>{/if}
										<a
											class="button secondary"
											href={resolve('/events/[id]/calendar.ics', { id: String(event.id) })}
											>{m.calendar_ics()}</a
										>
									</Dialog>
								{/if}
							</div>{/if}
					</EventCard>
				{:else}<p>{m.calendar_empty()}</p>{/each}
			</section>
		{/each}
	</div>

	<footer class="live-status">● {m.calendar_live()}</footer>
</div>

<style>
	.calendar-period {
		flex-basis: 100%;
		color: var(--color-signal-text);
		font: var(--font-mono-sm) var(--font-mono);
		margin: 0;
	}
	h3 {
		display: flex;
		align-items: baseline;
		gap: var(--space-sm);
	}
	h3 .day-number {
		font-size: var(--font-title-mobile);
		font-weight: 800;
		font-family: var(--font-heading);
	}
	.calendar-heading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
	}
	h1 {
		font-size: var(--font-calendar-title);
		margin-inline-end: auto;
	}
	.shift-counter {
		padding: var(--space-md);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius);
	}
	.shift-counter h2 {
		font: 700 var(--font-small) var(--font-body);
		color: var(--color-muted);
		text-transform: uppercase;
		margin-bottom: var(--space-sm);
	}
	.counter-values,
	.counter-seats {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		flex-wrap: wrap;
	}
	.counter-values {
		gap: var(--space-sm);
	}
	.counter-seat {
		width: var(--seat-size);
		height: var(--seat-size);
		border: var(--border-strong) solid var(--color-border);
		border-radius: var(--radius-seat);
	}
	.counter-seat.own {
		background: var(--color-signal);
		border-color: var(--color-signal);
	}
	.calendar {
		display: flex;
		gap: var(--space-md);
		overflow-x: auto;
	}
	.calendar > section {
		flex: 1 0 var(--calendar-day-width);
		min-width: 0;
	}
	h3 {
		padding-bottom: var(--space-sm);
		border-bottom: var(--border-strong) solid var(--color-border);
		text-transform: uppercase;
		font-size: var(--font-mono-sm);
	}
	.today {
		border-color: var(--color-signal);
	}
	.today small {
		margin-inline-start: auto;
		text-transform: none;
		color: var(--color-signal-text);
		font-family: var(--font-mono);
	}
	.capacity {
		color: var(--color-ok);
		font: 600 var(--font-tiny) var(--font-mono);
	}
	.ticket-actions {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}
	.ticket-actions form {
		flex: 1;
	}
	.capacity.own {
		color: var(--color-signal-text);
	}
	.capacity.full {
		color: var(--color-danger);
	}
	.confirmation {
		color: var(--color-ok);
		font-weight: 700;
	}
	.day-tabs {
		display: none;
	}
	.live-status {
		margin-top: var(--space-lg);
		padding-top: var(--space-lg);
		border-top: var(--border-width) solid var(--color-border);
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	@media (max-width: 767px) {
		h1 {
			font-size: var(--font-calendar-mobile);
			margin-bottom: 0;
		}
		.shift-counter {
			padding: 0;
			border: 0;
			background: transparent;
			margin-inline-start: auto;
		}
		.shift-counter h2 {
			display: none;
		}
		.counter-values {
			flex-direction: column;
			align-items: end;
			font-size: var(--font-tiny);
		}
		.day-number {
			font-family: var(--font-heading);
			font-size: var(--font-section);
		}
		.calendar-heading {
			align-items: center;
		}
		.calendar {
			flex-direction: column;
			overflow: visible;
		}
		.calendar > section {
			flex: auto;
		}
		.calendar > section.inactive {
			display: none;
		}
		.day-tabs {
			display: flex;
			gap: var(--space-xs);
			overflow-x: auto;
			margin-block: var(--space-md);
		}
		.day-tabs button {
			position: relative;
			flex: 1 0 var(--day-tab-width);
			min-height: var(--day-tab-height);
			border-radius: var(--radius-field);
			background: transparent;
			color: var(--color-muted);
			padding: var(--space-xs);
			font-size: var(--font-small);
			flex-direction: column;
		}
		.day-tabs [aria-selected='true'] {
			background: var(--color-text);
			color: var(--color-background);
			border-color: var(--color-text);
		}
		.day-tabs button.today {
			border-color: var(--color-signal);
		}
		.own-day {
			width: var(--space-xs);
			height: var(--space-xs);
			border-radius: var(--radius-pill);
			background: var(--color-signal);
		}
	}
</style>
