<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Dialog from '#lib/components/Dialog.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{m.nav_templates()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_templates()}</h1>
<a href={resolve('/admin/templates/new')}>{m.template_create_link()}</a>
{#if form && 'week' in form && form.week}
	<p>
		<a href="{resolve('/admin')}?week={form.week}">{m.template_view_week({ week: form.week })}</a>
	</p>
{/if}
<section aria-label={m.template_import_title()}>
	<h2>{m.template_import_title()}</h2>
	<a href={resolve('/admin/templates/example.csv')} download>{m.template_example()}</a>
	<form method="POST" action="?/importCsv" enctype="multipart/form-data" use:enhance>
		<label for="csv">{m.template_file()}</label><input
			id="csv"
			type="file"
			name="file"
			accept=".csv"
			required
		/>
		<button type="submit">{m.template_import_title()}</button>
	</form>
</section>
{#if !data.templates.length}<p>{m.template_list_empty()}</p>{/if}
{#each data.templates as template (template.id)}
	<article aria-label={template.name}>
		<h2>{template.name}</h2>
		<p>{template.description}</p>
		<p>
			{m.template_target_week()}: {template.targetWeek} · {m.template_event_count({
				count: template.eventCount
			})}
		</p>
		<p>
			{m.template_created_at()}:
			<time datetime={template.createdAt.toISOString()}
				>{new Intl.DateTimeFormat(getLocale(), {
					dateStyle: 'medium',
					timeStyle: 'short',
					timeZone: 'Europe/Rome'
				}).format(template.createdAt)}</time
			>
		</p>
		<form method="POST" action="?/apply" use:enhance>
			<input type="hidden" name="id" value={template.id} />
			<label><input type="checkbox" name="overwrite" value="true" /> {m.template_overwrite()}</label
			>
			<button type="submit">{m.template_apply()}</button>
		</form>
		<Dialog label={m.template_delete()} title={m.template_delete()}>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={template.id} />
				<p>{template.name}</p>
				<button type="submit">{m.template_delete()}</button>
			</form>
		</Dialog>
	</article>
{/each}

<style>
	article {
		border-block-start: var(--border-width) solid var(--color-text);
		padding-block: var(--space-md);
	}
</style>
