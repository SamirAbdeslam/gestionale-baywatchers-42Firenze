<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import { enhance } from '$app/forms';
	import Dialog from '#lib/components/Dialog.svelte';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const weeks = [1, 2, 3, 4];
	const kindLabels = {
		exam: m.event_kind_exam,
		icebreaker: m.event_kind_icebreaker,
		rush: m.event_kind_rush,
		cluster: m.event_kind_cluster,
		welcome: m.event_kind_welcome,
		custom: m.event_kind_custom
	};
	onMount(() =>
		listenRealtime(() => {
			void invalidate('app:admin');
		})
	);
</script>

<svelte:head><title>{m.nav_admin()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_admin()}</h1>
<label for="display-url">{m.admin_display_link()}</label>
<input id="display-url" type="url" readonly value={data.displayUrl} />
<dl>
	<dt>{m.admin_active_week()}</dt>
	<dd>{data.settings.activeWeek}</dd>
	<dt>{m.admin_display_week()}</dt>
	<dd>{data.settings.displayWeek}</dd>
	<dt>{m.admin_max_events()}</dt>
	<dd>
		{data.settings.maxEventsPerUser === 0 ? m.admin_unlimited() : data.settings.maxEventsPerUser}
	</dd>
	<dt>{m.admin_pool_start()}</dt>
	<dd>{data.settings.poolStart ?? m.admin_dates_unset()}</dd>
	<dt>{m.admin_pool_end()}</dt>
	<dd>{data.settings.poolEnd ?? m.admin_dates_unset()}</dd>
</dl>
<form method="GET">
	<label for="view-week">{m.admin_view_week()}</label>
	<select id="view-week" name="week" value={data.week}
		>{#each weeks as week (week)}<option value={week}>{week}</option>{/each}</select
	>
	<button type="submit">{m.admin_show_week()}</button>
</form>
<ul aria-label={m.admin_week_dates()}>
	{#each data.dayDates as date, index (index)}<li>
			{weekdays[index]()}
			{date ?? m.admin_dates_unset()}
		</li>{/each}
</ul>
<section aria-labelledby="pool-title">
	<h2 id="pool-title">{m.admin_pool_dates()}</h2>
	<form method="POST" use:enhance action={`?/setPoolDates&week=${data.week}`}>
		<label for="pool-start">{m.admin_pool_start()}</label><input
			id="pool-start"
			type="date"
			name="start"
			value={data.settings.poolStart ?? ''}
			required
		/>
		<label for="pool-end">{m.admin_pool_end()}</label><input
			id="pool-end"
			type="date"
			name="end"
			value={data.settings.poolEnd ?? ''}
		/>
		<p>{m.admin_pool_end_hint()}</p>
		<button type="submit">{m.admin_save_pool_dates()}</button>
	</form>
</section>
<section aria-labelledby="active-title">
	<h2 id="active-title">{m.admin_active_week()}</h2>
	<form method="POST" use:enhance action={`?/setActiveWeek&week=${data.week}`}>
		<label for="active-week">{m.admin_activate_week()}</label><select
			id="active-week"
			name="week"
			value={data.settings.activeWeek}
			>{#each weeks as week (week)}<option value={week}>{week}</option>{/each}</select
		>
		<button type="submit">{m.admin_activate()}</button>
	</form>
</section>
<section aria-labelledby="limit-title">
	<h2 id="limit-title">{m.admin_max_events()}</h2>
	<form method="POST" use:enhance action={`?/setMaxEvents&week=${data.week}`}>
		<label for="max-events">{m.admin_max_events()}</label><input
			id="max-events"
			type="number"
			name="maxEvents"
			min="0"
			max="32767"
			step="1"
			value={data.settings.maxEventsPerUser}
			required
		/>
		<p>{m.admin_max_events_hint()}</p>
		<button type="submit">{m.admin_save_limit()}</button>
	</form>
</section>
<form method="POST" use:enhance action={`?/resetDisplayWeek&week=${data.week}`}>
	<button type="submit">{m.admin_reset_display_week()}</button>
</form>

{#snippet eventFields(prefix: string, event?: PageProps['data']['events'][number])}
	<label for={`${prefix}-title`}>{m.admin_event_title()}</label>
	<input
		id={`${prefix}-title`}
		name="title"
		value={event?.title ?? ''}
		maxlength="120"
		required={!!event}
	/>
	<label for={`${prefix}-description`}>{m.admin_event_description()}</label>
	<textarea id={`${prefix}-description`} name="description" maxlength="500"
		>{event?.description ?? ''}</textarea
	>
	<label for={`${prefix}-weekday`}>{m.admin_event_weekday()}</label>
	<select id={`${prefix}-weekday`} name="weekday" value={event?.weekday ?? 1}>
		{#each weekdays as day, index (index)}<option value={index + 1}>{day()}</option>{/each}
	</select>
	<label for={`${prefix}-start`}>{m.admin_event_start()}</label>
	<input
		id={`${prefix}-start`}
		name="startTime"
		type="time"
		value={event?.startTime.slice(0, 5) ?? '09:00'}
		required
	/>
	<label for={`${prefix}-end`}>{m.admin_event_end()}</label>
	<input
		id={`${prefix}-end`}
		name="endTime"
		type="time"
		value={event?.endTime.slice(0, 5) ?? '10:00'}
		required
	/>
	<label for={`${prefix}-slots`}>{m.admin_event_slots()}</label>
	<input
		id={`${prefix}-slots`}
		name="maxSlots"
		type="number"
		min="1"
		max="2147483647"
		step="1"
		value={event?.maxSlots ?? 10}
		required
	/>
	<label for={`${prefix}-compensation`}>{m.admin_event_compensation()}</label>
	<input
		id={`${prefix}-compensation`}
		name="compensation"
		type="number"
		min="0"
		max="2147483647"
		step="1"
		value={event?.compensation ?? 0}
		required
	/>
{/snippet}

<section aria-labelledby="create-event-heading">
	<h2 id="create-event-heading">{m.admin_create_event()}</h2>
	<form method="POST" action={`?/createEvent&week=${data.week}`} use:enhance>
		<label for="create-week">{m.admin_event_week()}</label>
		<select id="create-week" name="week" value={data.week}>
			{#each weeks as week (week)}<option value={week}>{week}</option>{/each}
		</select>
		<label for="create-kind">{m.admin_event_kind()}</label>
		<select id="create-kind" name="kind">
			{#each data.kinds as kind (kind)}<option value={kind}>{kindLabels[kind]()}</option>{/each}
		</select>
		<p>{m.admin_preset_hint()}</p>
		{@render eventFields('create')}
		<label for="create-date">{m.admin_event_date()}</label>
		<input id="create-date" name="eventDate" type="date" />
		<p>{m.admin_event_date_hint()}</p>
		<button type="submit">{m.admin_create_event()}</button>
	</form>
</section>
{#snippet confirmDelete(action: string, hidden: Record<string, number>)}
	<form method="POST" action={`?/${action}&week=${data.week}`} use:enhance>
		{#each Object.entries(hidden) as [name, value] (name)}<input
				type="hidden"
				{name}
				{value}
			/>{/each}
		<label
			><input
				type="checkbox"
				name="confirm"
				value="yes"
				required
			/>{m.admin_confirm_checkbox()}</label
		>
		<button type="submit">{m.admin_confirm_delete()}</button>
	</form>
{/snippet}

<section aria-labelledby="events-title">
	<h2 id="events-title">{m.admin_events()}</h2>
	<Dialog label={m.admin_delete_week()} title={m.admin_confirm_delete_week()}>
		{@render confirmDelete('deleteWeekEvents', { week: data.week })}
	</Dialog>
	<Dialog label={m.admin_delete_all()} title={m.admin_confirm_delete_all()}>
		{@render confirmDelete('deleteAllEvents', {})}
	</Dialog>
	{#each weekdays as day, index (index)}
		<section aria-labelledby={`day-${index + 1}`}>
			<h3 id={`day-${index + 1}`}>{day()}</h3>
			<Dialog label={m.admin_delete_day()} title={m.admin_confirm_delete_day()}>
				{@render confirmDelete('deleteDayEvents', { week: data.week, weekday: index + 1 })}
			</Dialog>
			{#each data.events.filter((event) => event.weekday === index + 1) as event (event.id)}
				<article aria-label={event.title} data-kind={event.kind}>
					<h4>{event.title}</h4>
					<p>{event.description}</p>
					<dl>
						<dt>{m.admin_event_kind()}</dt>
						<dd>{kindLabels[event.kind]()}</dd>
						<dt>{m.admin_event_week()}</dt>
						<dd>{formatNumber(event.week)}</dd>
						<dt>{m.admin_event_date()}</dt>
						<dd>{event.eventDate ?? m.admin_dates_unset()}</dd>
						<dt>{m.admin_concrete_date()}</dt>
						<dd>{event.formattedDate || m.admin_dates_unset()}</dd>
						<dt>{m.admin_event_start()}</dt>
						<dd>{event.startTime.slice(0, 5)}</dd>
						<dt>{m.admin_event_end()}</dt>
						<dd>{event.endTime.slice(0, 5)}</dd>
						<dt>{m.admin_event_slots()}</dt>
						<dd>{formatNumber(event.maxSlots)}</dd>
						<dt>{m.admin_event_compensation()}</dt>
						<dd>{formatNumber(event.compensation)} ₳</dd>
					</dl>
					<p>
						{m.admin_registered_count({ count: formatNumber(event.registeredCount) })} / {formatNumber(
							event.maxSlots
						)}
					</p>
					<p>{m.admin_attended_count({ count: formatNumber(event.attendedCount) })}</p>
					{#if event.maxSlots < event.registeredCount}<p role="status">
							{m.admin_capacity_warning()}
						</p>{/if}
					<ul aria-label={m.admin_participants()}>
						{#each event.participants as participant (participant.id)}
							<li>
								{participant.participantLogin} — {participant.attended
									? m.admin_participant_present()
									: m.admin_participant_absent()}
								<form method="POST" action={`?/setAttendance&week=${data.week}`} use:enhance>
									<input type="hidden" name="id" value={event.id} />
									<input type="hidden" name="login" value={participant.participantLogin} />
									<input type="hidden" name="attended" value={String(!participant.attended)} />
									<button type="submit"
										>{participant.attended ? m.admin_mark_absent() : m.admin_mark_present()}</button
									>
								</form>
								<form method="POST" action={`?/removeParticipant&week=${data.week}`} use:enhance>
									<input type="hidden" name="id" value={event.id} />
									<input type="hidden" name="login" value={participant.participantLogin} />
									<button type="submit">{m.admin_remove_participant()}</button>
								</form>
							</li>
						{/each}
					</ul>
					<form method="POST" action={`?/addParticipant&week=${data.week}`} use:enhance>
						<input type="hidden" name="id" value={event.id} />
						<label for={`participant-${event.id}`}>{m.admin_participant_login()}</label>
						<input id={`participant-${event.id}`} name="login" maxlength="32" required />
						<button type="submit">{m.admin_add_participant()}</button>
					</form>

					<details>
						<summary>{m.admin_edit_event()}</summary>
						<form method="POST" action={`?/updateEvent&week=${data.week}`} use:enhance>
							<input type="hidden" name="id" value={event.id} />
							{@render eventFields(`edit-${event.id}`, event)}
							<button type="submit">{m.admin_save_event()}</button>
						</form>
					</details>
					<Dialog label={m.admin_delete_event()} title={m.admin_confirm_delete_event()}>
						<form method="POST" action={`?/deleteEvent&week=${data.week}`} use:enhance>
							<input type="hidden" name="id" value={event.id} />
							<button type="submit">{m.admin_confirm_delete()}</button>
						</form>
					</Dialog>
				</article>
			{:else}<p>{m.admin_no_events()}</p>{/each}
		</section>
	{/each}
</section>

<style>
	article {
		border: var(--border-width) solid var(--color-text);
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
	article[data-kind='custom'] {
		border-color: var(--color-custom);
	}
	textarea {
		width: 100%;
		max-width: 100%;
		font: inherit;
	}
</style>
