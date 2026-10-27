<script lang="ts">
	import { resolve } from '$app/paths';
	import Dialog from '#lib/components/Dialog.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	const options = [
		{ name: 'events', label: m.pool_reset_events },
		{ name: 'whitelist', label: m.pool_reset_whitelist },
		{ name: 'weeks', label: m.pool_reset_weeks },
		{ name: 'dates', label: m.pool_reset_dates }
	] as const;
</script>

<svelte:head><title>{m.pool_close()} — {m.app_name()}</title></svelte:head>
<h1>{m.pool_close()}</h1>
<Toast messages={data.messages} />
<form method="GET" action={resolve('/admin/close-pool')}>
	<input type="hidden" name="review" value="yes" />
	<fieldset>
		<legend>{m.pool_step_download()}</legend>
		<div class="downloads">
			<a class="button secondary" href={resolve('/admin/participants/summary.csv')}
				>{m.reports_summary_csv()}</a
			>
			<a class="button secondary" href={resolve('/admin/participants/detailed.csv')}
				>{m.reports_detailed_csv()}</a
			>
		</div>
		<label
			><input
				type="checkbox"
				name="downloaded"
				value="yes"
				required
				checked={!!data.choices?.downloaded}
			/>{m.pool_downloaded()}</label
		>
	</fieldset>
	<fieldset>
		<legend>{m.pool_step_reset()}</legend>
		<p>{m.pool_preserved()}</p>
		{#each options as option (option.name)}
			<label
				><input
					type="checkbox"
					name={option.name}
					value="yes"
					checked={!!data.choices?.[option.name]}
				/>{option.label()}</label
			>
		{/each}
	</fieldset>
	<button class="danger" type="submit">{m.pool_review()}</button>
</form>
{#if data.choices}
	<Dialog label={m.pool_review()} title={m.pool_step_confirm()} open>
		<p>{m.pool_confirm_hint()}</p>
		<ul>
			{#each options as option (option.name)}
				{#if data.choices[option.name]}<li>{option.label()}</li>{/if}
			{/each}
		</ul>
		<form method="POST" action="?/closePool">
			{#each Object.entries(data.choices) as [name, value] (name)}
				{#if value}<input type="hidden" {name} {value} />{/if}
			{/each}
			<button class="danger" type="submit">{m.pool_close()}</button>
		</form>
	</Dialog>
{/if}

<style>
	form {
		max-width: var(--dialog-width);
	}
	fieldset {
		margin-block: var(--space-lg);
		padding: var(--space-md);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
	}
	legend {
		font-weight: 700;
	}
	label {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		margin-block: var(--space-md);
	}
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin-block: var(--space-md);
	}
</style>
