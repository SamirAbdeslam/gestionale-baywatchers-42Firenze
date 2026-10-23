<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Dialog from '#lib/components/Dialog.svelte';
	import type { PageData, ActionData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
	const dateFormat = new Intl.DateTimeFormat(getLocale(), {
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/Rome'
	});
</script>

<svelte:head><title>{m.nav_templates()} — {m.app_name()}</title></svelte:head>
<div class="page-head">
	<div>
		<h1>{m.nav_templates()}</h1>
		<p class="intro">{m.template_intro()}</p>
	</div>
	<a class="button" href={resolve('/admin/templates/new')}>+ {m.template_create_link()}</a>
</div>
{#if form && 'week' in form && form.week}
	<p>
		<a href="{resolve('/admin')}?week={form.week}">{m.template_view_week({ week: form.week })}</a>
	</p>
{/if}
<div class="template-layout">
	<aside>
		<section aria-label={m.template_import_title()}>
			<h2>{m.template_import_title()}</h2>
			<p class="help">{m.template_import_help()}</p>
			<form method="POST" action="?/importCsv" enctype="multipart/form-data" use:enhance>
				<div class="csv-drop">
					<span aria-hidden="true">↑</span><label for="csv">{m.template_file()}</label><input
						id="csv"
						type="file"
						name="file"
						accept=".csv"
						required
					/>
				</div>
				<div class="import-actions">
					<a href={resolve('/admin/templates/example.csv')} download>{m.template_example()}</a>
					<button type="submit">{m.template_import_title()}</button>
				</div>
			</form>
		</section>
	</aside>
	<div class="template-list">
		{#if !data.templates.length}<p>{m.template_list_empty()}</p>{/if}
		{#each data.templates as template (template.id)}
			<article aria-label={template.name}>
				<header>
					<h2>{template.name}</h2>
					<span class="week">W{template.targetWeek}</span>
				</header>
				<p>{template.description}</p>
				<div class="kind-bar" aria-hidden="true">
					{#each template.kinds as kind, i (i)}<span data-kind={kind}></span>{/each}
				</div>
				<p class="meta">
					<span class="sr-only">{m.template_target_week()}: {template.targetWeek} ·</span>
					{m.template_event_count({ count: template.eventCount })} ·
					<time datetime={template.createdAt.toISOString()}
						>{dateFormat.format(template.createdAt)}</time
					>
				</p>
				<div class="actions">
					<form class="apply-template" method="POST" action="?/apply" use:enhance>
						<input type="hidden" name="id" value={template.id} />
						<label
							><input type="checkbox" name="overwrite" value="true" />
							{m.template_overwrite()}</label
						>
						<button class="secondary" type="submit"
							>{m.template_apply()} W{template.targetWeek}</button
						>
					</form>
					<div class="delete">
						<Dialog label={m.template_delete()} title={m.template_delete()}>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={template.id} />
								<p>{template.name}</p>
								<button class="danger" type="submit">{m.template_delete()}</button>
							</form>
						</Dialog>
					</div>
				</div>
			</article>
		{/each}
	</div>
</div>

<style>
	.page-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.page-head h1 {
		margin: 0;
	}
	.intro {
		margin: 0;
		color: var(--color-muted);
	}
	.template-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--admin-editor-width);
		gap: var(--space-md);
		margin-top: var(--space-lg);
		align-items: start;
	}
	aside {
		grid-column: 2;
		grid-row: 1;
		padding: var(--space-md);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
	}
	aside h2 {
		font-size: var(--font-section);
		margin-top: 0;
	}
	.help {
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	.template-list {
		grid-column: 1;
		grid-row: 1;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	article {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		padding: var(--space-md);
		background: var(--color-surface);
		min-width: 0;
	}
	article header {
		display: flex;
		justify-content: space-between;
		align-items: start;
		gap: var(--space-sm);
		/* reset the global page header bar */
		padding: 0;
		min-height: 0;
		background: none;
		border: 0;
	}
	article h2 {
		margin: 0;
		font-size: var(--font-section);
	}
	.week {
		padding: var(--space-xs) var(--space-sm);
		border: var(--border-strong) solid var(--color-text);
		border-radius: var(--radius-sm);
		font: 600 var(--font-small) var(--font-mono);
	}
	article p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	.meta {
		font-family: var(--font-mono);
	}
	.kind-bar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
	.kind-bar span {
		width: var(--seat-size);
		height: var(--kind-bar-height);
		border-radius: var(--radius-seat);
		background: var(--kind-fill);
	}
	.actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
		padding-top: var(--space-sm);
		border-top: var(--border-width) solid var(--color-border);
	}
	.apply-template {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
		flex: 1;
		margin: 0;
	}
	.apply-template label {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		margin-inline-end: auto;
	}
	.delete > :global(button) {
		background: transparent;
		color: var(--color-danger);
		border: var(--border-strong) solid var(--color-danger);
	}
	.csv-drop {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: var(--space-sm);
		padding: var(--space-lg) var(--space-md);
		border: var(--border-strong) dashed var(--color-border);
		border-radius: var(--radius);
		width: 100%;
		background: var(--color-background);
	}
	.csv-drop > span {
		font-size: var(--font-title);
		color: var(--color-signal-text);
		line-height: 1;
	}
	input[type='file'] {
		padding: var(--space-xs);
		width: 100%;
		font-size: var(--font-small);
	}
	.import-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-sm);
		width: 100%;
	}
	.import-actions a {
		color: var(--color-signal-text);
		font-size: var(--font-small);
	}
	@media (max-width: 1199px) {
		.template-list {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 767px) {
		.template-layout {
			display: flex;
			flex-direction: column;
		}
		aside,
		.template-list {
			width: 100%;
		}
	}
</style>
