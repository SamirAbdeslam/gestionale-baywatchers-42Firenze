<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import EventCard from '#lib/components/EventCard.svelte';
	import ParticipantBadge from '#lib/components/ParticipantBadge.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { weekdays } from '#lib/weekdays.ts';
	import { PRESETS } from '#lib/kinds.ts';
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
	const reload = () => invalidate('app:admin');
	onMount(() =>
		listenRealtime((event) => {
			if (event.type !== 'log_created') void reload();
		}, reload)
	);
</script>

<svelte:head><title>{m.nav_admin()} — {m.app_name()}</title></svelte:head>
<h1 class="sr-only">{m.nav_admin()}</h1>
<details class="settings-panel">
	<summary>{m.admin_settings()} · W0{data.settings.activeWeek}</summary>
	<div class="settings-grid">
		<section aria-labelledby="pool-title">
			<h2 id="pool-title">{m.admin_pool_dates()}</h2>
			<form method="POST" use:enhance action={`?/setPoolDates&week=${data.week}`}>
				<div class="pair">
					<div>
						<label for="pool-start">{m.admin_pool_start()}</label><input
							id="pool-start"
							type="date"
							name="start"
							value={data.settings.poolStart ?? ''}
							required
						/>
					</div>
					<div>
						<label for="pool-end">{m.admin_pool_end()}</label><input
							id="pool-end"
							type="date"
							name="end"
							value={data.settings.poolEnd ?? ''}
						/>
					</div>
				</div>
				<p class="hint">{m.admin_pool_end_hint()}</p>
				<button class="secondary" type="submit">{m.admin_save_pool_dates()}</button>
			</form>
		</section>
		<section aria-labelledby="active-title">
			<h2 id="active-title">{m.admin_active_week()}</h2>

			<form
				class="setting-row"
				method="POST"
				use:enhance
				action={`?/setActiveWeek&week=${data.week}`}
			>
				<p class="big">
					W0{data.settings.activeWeek}
				</p>
				<label class="sr-only" for="active-week">{m.admin_activate_week()}</label>
				<div class="inline">
					<select id="active-week" name="week" value={data.settings.activeWeek}
						>{#each weeks as week (week)}<option value={week}>W0{week}</option>{/each}</select
					>
					<button type="submit">{m.admin_activate()}</button>
				</div>
			</form>
			<p class="hint">{m.admin_visible_to_users()}</p>
		</section>
		<section class="display-settings" aria-labelledby="display-title">
			<h2 id="display-title">{m.display_title()}</h2>
			<p class="big">
				<span class="sr-only">{m.admin_display_week()}:</span>
				W0{formatNumber(data.settings.displayWeek)} <small>{m.admin_display_advances()}</small>
			</p>
			<details class="display-url">
				<summary>{m.admin_display_link()}</summary><label class="sr-only" for="display-url"
					>{m.admin_display_link()}</label
				><input id="display-url" type="url" readonly value={data.displayUrl} />
			</details>
			<div class="inline">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Absolute URL includes the configured display token. -->
				<a class="button secondary" href={data.displayUrl} target="_blank" rel="noopener noreferrer"
					>{m.admin_display_link()}</a
				>
				<form method="POST" use:enhance action={`?/resetDisplayWeek&week=${data.week}`}>
					<button class="link" type="submit">{m.admin_reset_display_week()}</button>
				</form>
			</div>
		</section>
		<section aria-labelledby="limit-title">
			<h2 id="limit-title">{m.admin_max_events()}</h2>

			<form
				class="setting-row"
				method="POST"
				use:enhance
				action={`?/setMaxEvents&week=${data.week}`}
			>
				<p class="big">
					<span
						>{data.settings.maxEventsPerUser === 0
							? m.admin_unlimited()
							: formatNumber(data.settings.maxEventsPerUser)}</span
					>
				</p>
				<label class="sr-only" for="max-events">{m.admin_max_events()}</label>
				<div class="inline">
					<input
						id="max-events"
						type="number"
						name="maxEvents"
						min="0"
						max="32767"
						step="1"
						value={data.settings.maxEventsPerUser}
						required
					/>
					<button class="secondary" type="submit">{m.admin_save_limit()}</button>
				</div>
				<p class="sr-only">{m.admin_max_events_hint()}</p>
			</form>
			<p class="hint">{m.admin_per_week_hint()}</p>
		</section>
	</div>
</details>
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
<div class="week-head">
	<h2 class="week-title">{m.admin_week_heading({ week: data.week })}</h2>
	<nav class="week-chips" aria-label={m.admin_view_week()}>
		{#each weeks as week (week)}
			<a
				href="{resolve('/admin')}?week={week}"
				aria-current={week === data.week ? 'page' : undefined}>W0{week}</a
			>
		{/each}
	</nav>
	<form class="inline" method="GET">
		<input type="hidden" name="week" value={data.week} />
		<button class="secondary" type="submit">{m.admin_show_week()}</button>
	</form>
	<Dialog label={m.admin_create_event()} title={m.admin_create_event()}>
		{@render createEventForm('create')}
	</Dialog>
	<Dialog label={m.admin_save_week_template()} title={m.admin_save_week_template()}>
		<form method="POST" action={`?/saveWeekAsTemplate&week=${data.week}`} use:enhance>
			<input type="hidden" name="week" value={data.week} />
			<label for="week-template-name">{m.template_name()}</label>
			<input id="week-template-name" name="name" maxlength="120" required />
			<label for="week-template-description">{m.template_description()}</label>
			<textarea id="week-template-description" name="description" maxlength="500"></textarea>
			<label for="week-template-target">{m.template_target_week()}</label>
			<select id="week-template-target" name="targetWeek" value={data.week}>
				{#each weeks as week (week)}<option value={week}>{week}</option>{/each}
			</select>
			<button type="submit">{m.template_save()}</button>
		</form>
	</Dialog>
	<div class="danger-actions">
		<Dialog label={m.admin_delete_week()} title={m.admin_confirm_delete_week()}>
			{@render confirmDelete('deleteWeekEvents', { week: data.week })}
		</Dialog>
		<Dialog label={m.admin_delete_all()} title={m.admin_confirm_delete_all()}>
			{@render confirmDelete('deleteAllEvents', {})}
		</Dialog>
	</div>
</div>
{#snippet eventFields(prefix: string, event?: PageProps['data']['events'][number], weekday = 1)}
	<div class="field wide">
		<label for={`${prefix}-title`}>{m.admin_event_title()}</label>
		<input
			id={`${prefix}-title`}
			name="title"
			value={event?.title ?? ''}
			maxlength="120"
			required={!!event}
		/>
	</div>
	<div class="field wide">
		<label for={`${prefix}-description`}>{m.admin_event_description()}</label>
		<textarea id={`${prefix}-description`} name="description" maxlength="500"
			>{event?.description ?? ''}</textarea
		>
	</div>
	<div class="field">
		<label for={`${prefix}-weekday`}>{m.admin_event_weekday()}</label>
		<select id={`${prefix}-weekday`} name="weekday" value={event?.weekday ?? weekday}>
			{#each weekdays as day, index (index)}<option value={index + 1}>{day()}</option>{/each}
		</select>
	</div>
	<div class="field">
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
	</div>
	<div class="field">
		<label for={`${prefix}-start`}>{m.admin_event_start()}</label>
		<input
			id={`${prefix}-start`}
			name="startTime"
			type="time"
			value={event?.startTime.slice(0, 5) ?? '09:00'}
			required
		/>
	</div>
	<div class="field">
		<label for={`${prefix}-end`}>{m.admin_event_end()}</label>
		<input
			id={`${prefix}-end`}
			name="endTime"
			type="time"
			value={event?.endTime.slice(0, 5) ?? '10:00'}
			required
		/>
	</div>
	<div class="field">
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
	</div>
{/snippet}

{#snippet createEventForm(prefix: string, weekday = 1)}
	<form method="POST" action={`?/createEvent&week=${data.week}`} use:enhance>
		<label for={`${prefix}-week`}>{m.admin_event_week()}</label>
		<select id={`${prefix}-week`} name="week" value={data.week}>
			{#each weeks as week (week)}<option value={week}>{week}</option>{/each}
		</select>

		<fieldset class="kind-grid">
			<legend>{m.admin_event_kind()}</legend>
			{#each data.kinds as kind, index (kind)}
				<label data-kind={kind}
					><input type="radio" name="kind" value={kind} checked={index === 0} /><span
						class="kind-dot"
						aria-hidden="true"
					></span><span
						>{kindLabels[kind]()}<small class="mono"
							>{kind === 'custom' ? '—' : `${formatNumber(PRESETS[kind].compensation)} ₳`}</small
						></span
					></label
				>
			{/each}
		</fieldset>
		<p class="hint">{m.admin_preset_hint()}</p>
		<div class="fields">
			{@render eventFields(prefix, undefined, weekday)}
			<div class="field">
				<label for={`${prefix}-date`}>{m.admin_event_date()}</label>
				<input id={`${prefix}-date`} name="eventDate" type="date" />
			</div>
		</div>
		<p class="hint">{m.admin_event_date_hint()}</p>
		<button type="submit">{m.admin_create_event()}</button>
	</form>
{/snippet}
<div class="admin-workspace">
	<section aria-labelledby="events-title">
		<h2 id="events-title" class="sr-only">{m.admin_events()}</h2>
		<div class="days-grid">
			{#each weekdays as day, index (index)}
				<section class="day-group" role="group" aria-labelledby={`day-${index + 1}`}>
					<header class="day-heading">
						<h3 id={`day-${index + 1}`}>{day()}</h3>
						<span class="day-date">{data.dayDates[index] ?? m.admin_dates_unset()}</span>
						<div class="day-actions">
							<Dialog
								label={m.admin_create_event_day({ day: day() })}
								title={m.admin_create_event()}
								icon="add"
							>
								{@render createEventForm(`create-day-${index + 1}`, index + 1)}
							</Dialog>
							<Dialog
								label={m.admin_delete_day_named({ day: day() })}
								title={m.admin_confirm_delete_day()}
								icon="delete"
							>
								{@render confirmDelete('deleteDayEvents', { week: data.week, weekday: index + 1 })}
							</Dialog>
						</div>
					</header>
					{#each data.events.filter((event) => event.weekday === index + 1) as event (event.id)}
						<EventCard
							event={{
								...event,
								startTime: event.startTime.slice(0, 5),
								endTime: event.endTime.slice(0, 5)
							}}
							orientation="auto"
						>
							{#snippet meta()}{m.admin_attended_count({
									count: formatNumber(event.attendedCount)
								})}{/snippet}
							{#if event.maxSlots < event.registeredCount}<p role="status">
									{m.admin_capacity_warning()}
								</p>{/if}
							<ul aria-label={m.admin_participants()}>
								{#each event.participants as participant (participant.id)}
									<li>
										<ParticipantBadge
											login={participant.participantLogin}
											absent={!participant.attended}
										/>
										<form
											class="attendance"
											method="POST"
											action={`?/setAttendance&week=${data.week}`}
											use:enhance
										>
											<input type="hidden" name="id" value={event.id} />
											<input type="hidden" name="login" value={participant.participantLogin} />
											<button
												type="submit"
												name="attended"
												value="true"
												aria-label={m.admin_mark_present()}
												aria-pressed={participant.attended}
												disabled={participant.attended}>{m.attendance_present()}</button
											>
											<button
												type="submit"
												name="attended"
												value="false"
												aria-label={m.admin_mark_absent()}
												aria-pressed={!participant.attended}
												disabled={!participant.attended}>{m.attendance_absent()}</button
											>
										</form>
										<form
											method="POST"
											action={`?/removeParticipant&week=${data.week}`}
											use:enhance
										>
											<input type="hidden" name="id" value={event.id} />
											<input type="hidden" name="login" value={participant.participantLogin} />
											<button
												class="small remove"
												type="submit"
												aria-label={m.admin_remove_participant()}>×</button
											>
										</form>
									</li>
								{/each}
							</ul>
							<form
								class="add-participant"
								method="POST"
								action={`?/addParticipant&week=${data.week}`}
								use:enhance
							>
								<input type="hidden" name="id" value={event.id} />
								<label class="sr-only" for={`participant-${event.id}`}
									>{m.admin_participant_login()}</label
								>
								<input
									id={`participant-${event.id}`}
									name="login"
									maxlength="32"
									placeholder={m.admin_participant_login()}
									required
								/>
								<button class="small" type="submit" aria-label={m.admin_add_participant()}>+</button
								>
							</form>

							{#snippet actions()}
								<div class="event-actions">
									<Dialog label={m.admin_duplicate_event()} title={m.admin_duplicate_event()}>
										<form method="POST" action={`?/duplicateEvent&week=${data.week}`} use:enhance>
											<input type="hidden" name="id" value={event.id} />
											<label for={`duplicate-week-${event.id}`}>{m.admin_event_week()}</label>
											<select id={`duplicate-week-${event.id}`} name="week" value={event.week}>
												{#each weeks as week (week)}<option value={week}>{week}</option>{/each}
											</select>
											<label for={`duplicate-day-${event.id}`}>{m.admin_event_weekday()}</label>
											<select id={`duplicate-day-${event.id}`} name="weekday" value={event.weekday}>
												{#each weekdays as day, index (index)}<option value={index + 1}
														>{day()}</option
													>{/each}
											</select>
											<button type="submit">{m.admin_duplicate_event()}</button>
										</form>
									</Dialog>
									<Dialog label={m.admin_edit_event()} title={m.admin_edit_event()} icon="edit">
										<form method="POST" action={`?/updateEvent&week=${data.week}`} use:enhance>
											<input type="hidden" name="id" value={event.id} />
											<div class="fields">{@render eventFields(`edit-${event.id}`, event)}</div>
											<button type="submit">{m.admin_save_event()}</button>
										</form>
									</Dialog>
									<Dialog
										label={m.admin_delete_event()}
										title={m.admin_confirm_delete_event()}
										icon="delete"
									>
										<form method="POST" action={`?/deleteEvent&week=${data.week}`} use:enhance>
											<input type="hidden" name="id" value={event.id} />
											<button class="danger" type="submit">{m.admin_confirm_delete()}</button>
										</form>
									</Dialog>
								</div>
							{/snippet}
						</EventCard>
					{:else}<p>{m.admin_no_events()}</p>{/each}
				</section>
			{/each}
		</div>
	</section>
</div>

<style>
	/* settings */
	.settings-panel {
		margin-bottom: var(--space-md);
	}
	.settings-panel > summary {
		padding: var(--space-sm);
		font-weight: 700;
		cursor: pointer;
	}
	@supports selector(details::details-content) {
		@media (min-width: 768px) {
			.settings-panel::details-content {
				content-visibility: visible;
			}
			.settings-panel > summary {
				display: none;
			}
		}
	}
	.setting-row {
		display: flex;
		flex-direction: row;
		align-items: center;
	}
	.setting-row .big {
		flex: 0 1 auto;
		min-width: 0;
		font-size: var(--font-mono-sm);
	}
	.setting-row > .inline {
		min-width: min-content;
		flex: 1;
		width: auto;
	}
	[aria-labelledby='active-title'] .big {
		white-space: nowrap;
		flex: none;
	}
	.display-url {
		font-size: var(--font-small);
	}
	.week-chips {
		display: flex;
		gap: var(--space-xs);
	}
	.week-chips a {
		padding: var(--space-sm);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-sm);
		font: 600 var(--font-small) var(--font-mono);
		text-decoration: none;
	}
	.week-chips a[aria-current] {
		background: var(--color-text);
		color: var(--color-background);
	}
	.settings-grid {
		display: grid;
		grid-template-columns: var(--settings-columns);
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.settings-grid > section {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		background: var(--color-surface);
		padding: var(--space-sm);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		min-width: 0;
	}
	.settings-grid > section[aria-labelledby='active-title'] {
		border: var(--border-strong) solid var(--color-signal);
	}
	.settings-grid h2 {
		margin: 0;
		font-size: var(--font-small);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--color-muted);
	}
	[aria-labelledby='active-title'] h2 {
		color: var(--color-signal-text);
	}
	.settings-grid form {
		margin: 0;
		gap: var(--space-sm);
	}
	.settings-grid form[action*='setPoolDates'] {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: end;
	}
	.settings-grid form[action*='setPoolDates'] .pair {
		flex: 1;
	}
	.settings-grid form[action*='setPoolDates'] .hint {
		order: 1;
		flex-basis: 100%;
	}
	.settings-grid > .display-settings {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
	}
	.display-settings h2,
	.display-settings > .inline {
		grid-column: 1 / -1;
	}
	.settings-grid label {
		font-size: var(--font-small);
	}
	.setting-row .inline > input,
	.setting-row .inline > select {
		min-width: var(--settings-input-width);
	}
	.settings-grid .setting-row button {
		padding-inline: var(--space-xs);
	}
	.settings-grid input,
	.settings-grid select {
		padding-inline: var(--space-sm);
		width: 100%;
		min-height: var(--control-height-sm);
		font-family: var(--font-mono);
		font-size: var(--font-small);
	}
	.settings-grid button,
	.settings-grid .button,
	.week-head button {
		min-height: var(--control-height-sm);
		padding-inline: var(--space-sm);
		font-size: var(--font-small);
		white-space: nowrap;
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		width: 100%;
	}
	.inline {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--space-sm);
		width: 100%;
	}
	.inline > select,
	.inline > input {
		flex: 1;
		min-width: 0;
	}
	.inline form {
		width: auto;
	}
	.big {
		margin: 0;
		font: 800 var(--font-section) var(--font-heading);
		letter-spacing: var(--tracking-title);
	}
	.big small {
		font: var(--font-small) var(--font-body);
		letter-spacing: 0;
		color: var(--color-muted);
	}
	.hint {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	button.link {
		min-height: 0;
		padding: 0;
		background: none;
		border: 0;
		color: var(--color-signal-text);
		text-decoration: underline;
		font-size: var(--font-small);
		white-space: normal;
		text-align: start;
	}

	/* week header */
	.week-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
	}
	.week-title {
		margin: 0;
		font-size: var(--font-title);
		font-weight: 800;
		letter-spacing: var(--tracking-title);
	}
	.week-head > :global(button)::before {
		content: '+';
		margin-inline-end: var(--space-xs);
	}
	.week-head form {
		width: auto;
	}
	.week-head select {
		min-height: var(--control-height-sm);
		font-family: var(--font-mono);
	}
	.admin-workspace {
		min-width: 0;
	}
	.days-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(var(--admin-day-width), 1fr));
		gap: var(--space-md);
		overflow-x: auto;
	}
	.danger-actions {
		margin-inline-start: auto;
		flex-wrap: wrap;
	}
	.danger-actions,
	.day-actions,
	.event-actions {
		display: flex;
		gap: var(--space-xs);
	}
	.day-actions {
		margin-inline-start: auto;
	}
	.danger-actions > :global(button),
	.day-actions > :global(button) {
		background: transparent;
		border-color: var(--color-danger);
		color: var(--color-danger);
		font-size: var(--font-small);
	}
	.day-actions > :global(button:first-child) {
		border-color: var(--color-text);
		color: var(--color-text);
	}
	.event-actions {
		flex-wrap: wrap;
		margin-left: auto;
	}
	.event-actions > :global(button) {
		background: transparent;
		border: var(--border-width) solid currentColor;
		color: inherit;
		flex-shrink: 0;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		width: 100%;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}
	.field.wide {
		grid-column: 1 / -1;
	}
	.field input,
	.field select,
	.field textarea {
		width: 100%;
	}
	.field label {
		font-size: var(--font-small);
	}

	/* days */

	.day-group {
		min-width: 0;
		margin-block: var(--space-md);
	}
	.day-heading {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-xs);
		min-height: var(--day-tab-height);
		border-bottom: var(--border-strong) solid var(--color-border);
	}
	.day-heading h3 {
		margin: 0;
		font-size: var(--font-nav);
		text-transform: uppercase;
	}
	.day-date {
		color: var(--color-muted);
		font: var(--font-small) var(--font-mono);
	}

	/* event card contents */
	.admin-workspace :global(.ticket) {
		margin-bottom: var(--space-md);
	}
	.admin-workspace :global(.ticket-body > ul) {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.admin-workspace :global(.ticket-body li) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
		background: var(--color-background);
	}
	.admin-workspace :global(.ticket-body li form) {
		display: inline-flex;
		width: auto;
		margin: 0;
	}
	.admin-workspace :global(.ticket-body li form:first-of-type) {
		margin-inline-start: auto;
	}
	.admin-workspace :global(.ticket-body button) {
		width: auto;
	}
	button.small {
		min-height: var(--control-height-sm);
		padding: 0 var(--space-sm);
		font-size: var(--font-small);
		background: transparent;
		color: var(--color-text);
		border: var(--border-width) solid var(--color-border);
	}
	.admin-workspace button.remove {
		width: var(--control-height-sm);
		padding: 0;
		color: var(--color-danger);
	}
	.add-participant {
		display: flex;
		flex-direction: row;
		gap: var(--space-sm);
		width: 100%;
	}
	.add-participant input {
		flex: 1;
		min-width: 0;
		min-height: var(--control-height-sm);
		font-family: var(--font-mono);
		font-size: var(--font-small);
	}

	.attendance {
		flex-direction: row;
		gap: 0;
	}
	.attendance button {
		min-height: var(--control-height-sm);
		padding: var(--space-xs);
		border: var(--border-width) solid var(--color-border);
		border-radius: 0;
		font-size: var(--font-tiny);
		background: transparent;
		color: var(--color-muted);
	}
	.attendance button:first-of-type {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.attendance button:last-of-type {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.attendance button[aria-pressed='true'] {
		opacity: 1;
		background: var(--color-ok-bg);
		color: var(--color-ok);
	}
	.attendance button:last-of-type[aria-pressed='true'] {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	/* kind picker */
	.kind-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		border: 0;
		padding: 0;
		margin: 0;
		width: 100%;
	}
	.kind-grid legend {
		font-size: var(--font-small);
		font-weight: 700;
		margin-bottom: var(--space-sm);
	}
	.kind-grid label {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-height: var(--control-height-sm);
		padding: var(--space-sm);
		border: var(--border-strong) solid var(--color-border);
		border-radius: var(--radius-field);
		font-size: var(--font-small);
		cursor: pointer;
	}
	.kind-grid label:has(:checked) {
		border-color: var(--color-signal);
	}
	.kind-grid input {
		position: absolute;
		opacity: 0;
	}
	.kind-grid label:has(:focus-visible) {
		outline: var(--focus-width) solid var(--color-focus);
	}
	.kind-grid small {
		display: block;
		color: var(--color-muted);
		font-size: var(--font-tiny);
	}
	.kind-dot {
		flex-shrink: 0;
		width: var(--space-sm);
		height: var(--space-sm);
		border-radius: var(--radius-pill);
		background: var(--kind-fill);
	}
	textarea {
		width: 100%;
	}
	@media (max-width: 1199px) {
		.settings-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 767px) {
		.settings-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.days-grid {
			grid-template-columns: minmax(0, 1fr);
			overflow: visible;
		}
		.week-title {
			font-size: var(--font-title-mobile);
		}
	}
</style>
