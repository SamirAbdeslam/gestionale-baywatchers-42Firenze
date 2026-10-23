<script lang="ts">
	import { untrack, onMount } from 'svelte';
	import { inferKind } from '#lib/kinds.ts';
	import { formatNumber } from '#lib/format.ts';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { emptyTemplateForm, emptyTemplateEvent, type TemplateForm } from '#lib/template-form.ts';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let values = $state<TemplateForm>(untrack(() => form?.values ?? emptyTemplateForm()));
	function compactDetails(node: HTMLDetailsElement) {
		node.open = false;
	}
	let ready = $state(false);
	let selectedIndex = $state(0);
	const entries = $derived(
		values.events.map((event, index) => ({ event, index, kind: inferKind(event.title) }))
	);
	const totals = $derived({
		slots: values.events.reduce((sum, event) => sum + (Number(event.maxSlots) || 0), 0),
		compensation: values.events.reduce((sum, event) => sum + (Number(event.compensation) || 0), 0)
	});
	onMount(() => {
		ready = true;
	});
	$effect(() => {
		if (form?.values) values = form.values;
	});
</script>

<svelte:head><title>{m.template_new_title()} — {m.app_name()}</title></svelte:head>
<h1>{m.template_new_title()}</h1>
<div class="template-heading">
	<a href={resolve('/admin/templates')}><span aria-hidden="true">← </span>{m.template_back()}</a
	><span class="mono">{m.template_unsaved()}</span>
</div>
<form
	method="POST"
	action="?/save"
	use:enhance={({ formData, cancel }) => {
		const intent = formData.get('intent');
		if (intent === 'add') {
			cancel();
			values.events.push(emptyTemplateEvent());
			selectedIndex = values.events.length - 1;
		} else if (typeof intent === 'string' && intent.startsWith('remove:')) {
			cancel();
			values.events.splice(Number(intent.slice(7)), 1);
			selectedIndex = Math.min(selectedIndex, Math.max(0, values.events.length - 1));
		}
		return async ({ update }) => {
			await update({ reset: false });
		};
	}}
>
	<div class="template-metadata">
		<label for="name">{m.template_name()}</label><input
			id="name"
			name="name"
			bind:value={values.name}
			maxlength="120"
		/>
		<label for="week">{m.template_target_week()}</label><select
			id="week"
			name="targetWeek"
			bind:value={values.targetWeek}
			>{#each [1, 2, 3, 4] as week (week)}<option value={String(week)}>{week}</option
				>{/each}</select
		>
		<label for="description">{m.template_description()}</label><textarea
			id="description"
			name="description"
			bind:value={values.description}></textarea>
	</div>
	<div class="template-board">
		<div class="day-preview" aria-hidden={!ready}>
			{#each weekdays as day, dayIndex (dayIndex)}
				{#if dayIndex < 5 || values.events.some((event) => Number(event.weekday) === dayIndex + 1)}
					<section>
						<h2>{day()}</h2>
						{#each entries.filter(({ event }) => Number(event.weekday) === dayIndex + 1) as { event, index, kind } (index)}
							<button
								class="preview-event"
								type="button"
								data-kind={kind}
								class:selected={selectedIndex === index}
								disabled={!ready}
								onclick={() => (selectedIndex = index)}
							>
								<span class="mono">{event.startTime}–{event.endTime}</span><strong
									>{event.title || m.template_row({ count: index + 1 })}</strong
								><span class="mono">{event.maxSlots} · {event.compensation} ₳</span>
							</button>
						{/each}
					</section>
				{/if}
			{/each}
		</div>
		<div class="event-editors">
			{#each values.events as event, index (index)}
				<fieldset class:inactive={ready && selectedIndex !== index}>
					<legend class="sr-only">{m.template_row({ count: index + 1 })}</legend>
					<h2 class="editor-heading">
						{weekdays[Number(event.weekday) - 1]?.()} · {m.template_row({ count: index + 1 })}
					</h2>
					<div class="field full">
						<label for={`title-${index}`}>{m.template_event_title()}</label><input
							id={`title-${index}`}
							name={`events.${index}.title`}
							bind:value={event.title}
							maxlength="120"
						/>
					</div>
					<div class="field">
						<label for={`start-${index}`}>{m.template_event_start()}</label><input
							id={`start-${index}`}
							name={`events.${index}.startTime`}
							type="time"
							bind:value={event.startTime}
						/>
					</div>
					<div class="field">
						<label for={`end-${index}`}>{m.template_event_end()}</label><input
							id={`end-${index}`}
							name={`events.${index}.endTime`}
							type="time"
							bind:value={event.endTime}
						/>
					</div>
					<div class="field">
						<label for={`slots-${index}`}>{m.template_event_slots()}</label><input
							id={`slots-${index}`}
							name={`events.${index}.maxSlots`}
							inputmode="numeric"
							bind:value={event.maxSlots}
						/>
					</div>
					<div class="field">
						<label for={`compensation-${index}`}>{m.template_event_compensation()}</label><input
							id={`compensation-${index}`}
							name={`events.${index}.compensation`}
							inputmode="numeric"
							bind:value={event.compensation}
						/>
					</div>
					<details class="extra-fields" open use:compactDetails>
						<summary>{m.template_more_details()}</summary>
						<div class="extra-fields-grid">
							<div class="field">
								<label for={`day-${index}`}>{m.template_event_day()}</label><select
									id={`day-${index}`}
									name={`events.${index}.weekday`}
									bind:value={event.weekday}
									>{#each weekdays as day, dayIndex (dayIndex)}<option value={String(dayIndex + 1)}
											>{day()}</option
										>{/each}</select
								>
							</div>
							<div class="field">
								<label for={`date-${index}`}>{m.template_event_date()}</label><input
									id={`date-${index}`}
									name={`events.${index}.eventDate`}
									type="date"
									bind:value={event.eventDate}
								/>
							</div>
							<div class="field">
								<label for={`description-${index}`}>{m.template_event_description()}</label
								><textarea
									id={`description-${index}`}
									name={`events.${index}.description`}
									bind:value={event.description}
									maxlength="500"></textarea>
							</div>
						</div>
					</details>
					<button type="submit" name="intent" value={`remove:${index}`} formnovalidate
						>{m.template_remove_row()}</button
					>
				</fieldset>
			{/each}
		</div>
	</div>
	<div class="template-footer">
		<span class="mono"
			>{m.template_event_count({ count: values.events.length })} · {formatNumber(totals.slots)} · {formatNumber(
				totals.compensation
			)} ₳</span
		>
		<button type="submit" name="intent" value="add" formnovalidate>{m.template_add_row()}</button>
		<button type="submit" name="intent" value="save">{m.template_save()}</button>
	</div>
</form>

<style>
	:global(html:has(.template-footer)) {
		scroll-padding-block-end: calc(var(--control-height) * 3 + var(--bottom-nav-height));
	}
	.field,
	summary {
		scroll-margin-block: var(--space-md);
	}

	.field {
		display: grid;
		min-width: 0;
		gap: var(--space-sm);
	}
	.field.full,
	.extra-fields,
	.editor-heading,
	fieldset > button {
		grid-column: 1 / -1;
	}
	.extra-fields-grid {
		display: grid;
		gap: var(--space-sm);
		padding-block: var(--space-md);
	}
	summary {
		cursor: pointer;
		min-height: var(--control-height-sm);
		font-size: var(--font-label);
		color: var(--color-muted);
	}
	.editor-heading {
		font-size: var(--font-section);
		margin-bottom: var(--space-sm);
	}

	.template-heading {
		display: flex;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
		color: var(--color-muted);
	}
	form {
		align-items: stretch;
		padding-bottom: calc(var(--control-height) * 3);
	}
	.template-metadata {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr);
		gap: var(--space-sm) var(--space-md);
	}
	.template-metadata label {
		grid-row: 1;
	}
	.template-metadata input,
	.template-metadata select,
	.template-metadata textarea {
		grid-row: 2;
		width: 100%;
	}
	#name {
		font: 700 var(--font-section) var(--font-heading);
		min-height: var(--template-name-height);
	}
	.template-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--admin-editor-width);
		gap: var(--space-lg);
		margin-top: var(--space-lg);
	}
	.day-preview {
		display: grid;
		grid-auto-columns: minmax(var(--template-day-width), 1fr);
		grid-auto-flow: column;
		overflow-x: auto;
		gap: var(--space-sm);
		align-self: start;
	}
	.day-preview h2 {
		font: 700 var(--font-label) var(--font-body);
		color: var(--color-muted);
		text-transform: uppercase;
		border-bottom: var(--border-strong) solid var(--color-border);
		padding-bottom: var(--space-sm);
	}
	.preview-event {
		display: flex;
		flex-direction: column;
		text-align: start;
		align-items: start;
		background: var(--color-surface);
		color: var(--color-text);
		border: var(--border-width) solid var(--color-border);
		border-inline-start: var(--ticket-hole-step) solid var(--kind-fill);
		border-radius: var(--radius);
		padding: var(--space-sm);
		width: 100%;
		margin-bottom: var(--space-sm);
	}
	.preview-event.selected {
		outline: var(--border-strong) solid var(--color-signal);
	}
	.preview-event .mono {
		font-size: var(--font-tiny);
	}
	fieldset {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		min-width: 0;
		width: 100%;
		border: var(--border-strong) solid var(--color-signal);
		border-radius: var(--radius-panel);
		padding: var(--space-md);
		background: var(--color-surface);
	}
	fieldset.inactive {
		display: none;
	}
	legend {
		font-family: var(--font-heading);
		font-size: var(--font-section);
		font-weight: 700;
	}
	textarea,
	fieldset input,
	fieldset select {
		width: 100%;
	}
	.template-footer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: var(--layer-nav);
		background: var(--color-background);
		padding: var(--space-md) var(--space-xl);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		align-items: center;
		justify-content: flex-end;
		border-top: var(--border-width) solid var(--color-border);
		padding-top: var(--space-md);
		margin-top: var(--space-lg);
	}
	.template-footer > span {
		margin-inline-end: auto;
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	@media (max-width: 767px) {
		.template-footer {
			bottom: var(--bottom-nav-height);
			padding-inline: var(--space-md);
		}
		.template-metadata {
			display: flex;
			flex-direction: column;
		}
		.template-board {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
