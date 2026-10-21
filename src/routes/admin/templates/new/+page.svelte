<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { emptyTemplateForm, emptyTemplateEvent, type TemplateForm } from '#lib/template-form.ts';
	import type { ActionData } from './$types';
	let { form }: { form: ActionData } = $props();
	let values = $state<TemplateForm>(untrack(() => form?.values ?? emptyTemplateForm()));
	$effect(() => {
		if (form?.values) values = form.values;
	});
</script>

<svelte:head><title>{m.template_new_title()} — {m.app_name()}</title></svelte:head>
<h1>{m.template_new_title()}</h1>
<a href={resolve('/admin/templates')}>{m.template_back()}</a>
<form
	method="POST"
	action="?/save"
	use:enhance={({ formData, cancel }) => {
		const intent = formData.get('intent');
		if (intent === 'add') {
			cancel();
			values.events.push(emptyTemplateEvent());
		} else if (typeof intent === 'string' && intent.startsWith('remove:')) {
			cancel();
			values.events.splice(Number(intent.slice(7)), 1);
		}
		return async ({ update }) => {
			await update({ reset: false });
		};
	}}
>
	<label for="name">{m.template_name()}</label><input
		id="name"
		name="name"
		bind:value={values.name}
		maxlength="120"
	/>
	<label for="description">{m.template_description()}</label><textarea
		id="description"
		name="description"
		bind:value={values.description}></textarea>
	<label for="week">{m.template_target_week()}</label><select
		id="week"
		name="targetWeek"
		bind:value={values.targetWeek}
		>{#each [1, 2, 3, 4] as week (week)}<option value={String(week)}>{week}</option>{/each}</select
	>
	{#each values.events as event, index (index)}
		<fieldset>
			<legend>{m.template_row({ count: index + 1 })}</legend>
			<label for={`title-${index}`}>{m.template_event_title()}</label><input
				id={`title-${index}`}
				name={`events.${index}.title`}
				bind:value={event.title}
				maxlength="120"
			/>
			<label for={`description-${index}`}>{m.template_event_description()}</label><textarea
				id={`description-${index}`}
				name={`events.${index}.description`}
				bind:value={event.description}
				maxlength="500"></textarea>
			<label for={`day-${index}`}>{m.template_event_day()}</label><select
				id={`day-${index}`}
				name={`events.${index}.weekday`}
				bind:value={event.weekday}
				>{#each weekdays as day, dayIndex (dayIndex)}<option value={String(dayIndex + 1)}
						>{day()}</option
					>{/each}</select
			>
			<label for={`date-${index}`}>{m.template_event_date()}</label><input
				id={`date-${index}`}
				name={`events.${index}.eventDate`}
				type="date"
				bind:value={event.eventDate}
			/>
			<label for={`start-${index}`}>{m.template_event_start()}</label><input
				id={`start-${index}`}
				name={`events.${index}.startTime`}
				type="time"
				bind:value={event.startTime}
			/>
			<label for={`end-${index}`}>{m.template_event_end()}</label><input
				id={`end-${index}`}
				name={`events.${index}.endTime`}
				type="time"
				bind:value={event.endTime}
			/>
			<label for={`slots-${index}`}>{m.template_event_slots()}</label><input
				id={`slots-${index}`}
				name={`events.${index}.maxSlots`}
				inputmode="numeric"
				bind:value={event.maxSlots}
			/>
			<label for={`compensation-${index}`}>{m.template_event_compensation()}</label><input
				id={`compensation-${index}`}
				name={`events.${index}.compensation`}
				inputmode="numeric"
				bind:value={event.compensation}
			/>
			<button type="submit" name="intent" value={`remove:${index}`} formnovalidate
				>{m.template_remove_row()}</button
			>
		</fieldset>
	{/each}
	<button type="submit" name="intent" value="add" formnovalidate>{m.template_add_row()}</button>
	<button type="submit" name="intent" value="save">{m.template_save()}</button>
</form>

<style>
	fieldset {
		display: grid;
		gap: var(--space-sm);
		min-width: 0;
		width: 100%;
	}
	textarea {
		font: inherit;
		max-width: 100%;
		width: 100%;
		background: var(--color-background);
		color: var(--color-text);
	}
</style>
