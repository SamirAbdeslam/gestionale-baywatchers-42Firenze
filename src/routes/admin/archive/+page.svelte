<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatNumber } from '#lib/format.ts';
	import type { PageProps, PageData } from './$types';
	let { data, form }: PageProps = $props();
	const monthName = (date: string) =>
		new Intl.DateTimeFormat(getLocale(), {
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Rome'
		}).format(new Date(`${date}T12:00:00Z`));
	const kindLabels = {
		exam: m.event_kind_exam,
		icebreaker: m.event_kind_icebreaker,
		rush: m.event_kind_rush,
		cluster: m.event_kind_cluster,
		welcome: m.event_kind_welcome,
		custom: m.event_kind_custom
	};
	const skipReasons = {
		archive_skip_row: m.archive_skip_row,
		archive_skip_ambiguous: m.archive_skip_ambiguous,
		archive_skip_entry: m.archive_skip_entry
	};
	const preview = $derived(form && 'preview' in form ? form.preview : null);
</script>

<svelte:head><title>{m.archive_title()} — {m.app_name()}</title></svelte:head>
<h1>{m.archive_title()}</h1>
<div class="selectors">
	<form method="GET">
		<label for="archive-year">{m.archive_year()}</label>
		<select id="archive-year" name="year" value={data.year}>
			{#each data.years as year (year)}<option value={year}>{year}</option>{/each}
		</select>
		<button type="submit" disabled={!data.years.length}>{m.archive_show_year()}</button>
	</form>
	<form method="GET">
		<input type="hidden" name="year" value={data.year} />
		<label for="archive-pool">{m.archive_pool()}</label>
		<select id="archive-pool" name="pool" value={data.selected?.key}>
			{#each data.choices as pool (pool.key)}
				<option value={pool.key}
					>{monthName(pool.startDate)}{pool.current ? ` — ${m.archive_current()}` : ''}</option
				>
			{/each}
		</select>
		<button type="submit" disabled={!data.choices.length}>{m.archive_show_pool()}</button>
	</form>
</div>
{#if data.selected}
	<section aria-label={m.archive_pool()}>
		<h2>
			{monthName(data.selected.startDate)}{data.selected.current ? ` — ${m.archive_current()}` : ''}
		</h2>
		<p>
			{#if data.selected.current}<a href="{resolve('/recap')}?view=pool">{m.recap_together()}</a>
			{:else}<a href="{resolve('/recap/[poolId]', { poolId: data.selected.key })}?view=pool"
					>{m.recap_together()}</a
				>{/if}
		</p>
		{@render statistics(data.totals, data.participants)}
	</section>
{:else}<p>{m.archive_empty()}</p>{/if}

<section aria-labelledby="import-title">
	<h2 id="import-title">{m.archive_import_title()}</h2>
	<p>{m.archive_import_help()}</p>
	<form method="POST" action="?/preview" enctype="multipart/form-data" use:enhance>
		<label for="import-month">{m.archive_start_month()}</label>
		<input id="import-month" name="month" type="month" required />
		<label for="archive-file">{m.template_file()}</label>
		<input id="archive-file" name="file" type="file" accept=".csv" required />
		<button type="submit">{m.archive_preview()}</button>
	</form>
	{#if preview && form && 'csv' in form}
		<section aria-labelledby="preview-title">
			<h3 id="preview-title">{m.archive_preview()} — {monthName(`${form.month}-01`)}</h3>
			<p>
				{m.archive_read({
					rows: formatNumber(preview.rowsRead),
					entries: formatNumber(preview.count),
					skipped: formatNumber(preview.skipped.length)
				})}
			</p>
			{#if preview.skipped.length}
				<ul class="skipped">
					{#each preview.skipped as row, i (i)}
						<li>
							{m.archive_skipped_line({ line: formatNumber(row.line) })}: {skipReasons[
								row.reason
							]()} <q>{row.value}</q>
						</li>
					{/each}
				</ul>
			{/if}
			{@render statistics(preview.totals, preview.participants)}
			{#if preview.count}
				<form method="POST" action="?/importCsv" use:enhance>
					<input type="hidden" name="csv" value={form.csv} />
					<input type="hidden" name="month" value={form.month} />
					<label
						><input type="checkbox" name="confirmed" value="yes" required />
						{m.archive_confirm_check()}</label
					>
					<button type="submit">{m.archive_confirm()}</button>
				</form>
			{:else}<p>{m.archive_import_empty()}</p>{/if}
		</section>
	{/if}
</section>

{#snippet statistics(totals: PageData['totals'], participants: PageData['participants'])}
	<dl class="totals">
		<div>
			<dt>{m.archive_taken()}</dt>
			<dd>{formatNumber(totals.taken)}</dd>
		</div>
		<div>
			<dt>{m.archive_completed()}</dt>
			<dd>{formatNumber(totals.completed)}</dd>
		</div>
		<div>
			<dt>{m.reports_hours()}</dt>
			<dd>{formatNumber(totals.hours)}</dd>
		</div>
		<div>
			<dt>{m.reports_altarian()}</dt>
			<dd>{formatNumber(totals.altarian)}</dd>
		</div>
		<div>
			<dt>{m.nav_participants()}</dt>
			<dd>{formatNumber(totals.participants)}</dd>
		</div>
		<div>
			<dt>{m.reports_attendance()}</dt>
			<dd>{formatNumber(totals.attendancePercent)}%</dd>
		</div>
	</dl>
	<div class="charts">
		<svg viewBox="0 0 360 180" role="img" aria-label={m.archive_kind_chart()}>
			<title>{m.archive_kind_chart()}</title>
			{#each totals.byKind as item, i (item.kind)}
				<text x="0" y={i * 30 + 17}>{kindLabels[item.kind]()}</text>
				<rect data-kind={item.kind} x="140" y={i * 30 + 3} height="18" width={item.percent * 1.7} />
				<text x="320" y={i * 30 + 17}>{formatNumber(item.count)}</text>
			{/each}
		</svg>
		<svg class="donut" viewBox="0 0 120 120" role="img" aria-label={m.archive_kind_share()}>
			<title>{m.archive_kind_share()}</title>
			<circle class="track" cx="60" cy="60" r="45" />
			{#each totals.byKind as item, i (item.kind)}
				<circle
					data-kind={item.kind}
					cx="60"
					cy="60"
					r="45"
					pathLength="100"
					stroke-dasharray={`${item.percent} ${100 - item.percent}`}
					stroke-dashoffset={-totals.byKind
						.slice(0, i)
						.reduce((sum, kind) => sum + kind.percent, 0)}
					transform="rotate(-90 60 60)"
				>
					<title>{kindLabels[item.kind]()}: {formatNumber(item.percent)}%</title>
				</circle>
			{/each}
		</svg>
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontally scrollable table.) -->
	<div class="table-wrap" role="region" aria-label={m.nav_participants()} tabindex="0">
		<table>
			<thead
				><tr
					><th scope="col">{m.reports_login()}</th><th scope="col">{m.archive_taken()}</th><th
						scope="col">{m.archive_completed()}</th
					><th scope="col">{m.reports_hours()}</th><th scope="col">{m.reports_altarian()}</th><th
						scope="col">{m.reports_attendance()}</th
					></tr
				></thead
			>
			<tbody>
				{#each participants as participant (participant.login)}
					<tr
						><th scope="row">{participant.login}</th><td>{formatNumber(participant.taken)}</td><td
							>{formatNumber(participant.completed)}</td
						><td>{formatNumber(participant.hours)}</td><td>{formatNumber(participant.altarian)}</td
						><td>{formatNumber(participant.attendancePercent)}%</td></tr
					>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<style>
	.selectors,
	.totals,
	.charts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	section {
		margin-block: var(--space-lg);
		min-width: 0;
	}
	form {
		max-width: 100%;
	}
	input,
	select {
		max-width: 100%;
	}
	.totals div {
		padding: var(--space-sm);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius);
	}
	dd {
		margin: 0;
		font: 600 var(--font-section) var(--font-mono);
	}
	.charts {
		align-items: center;
		margin-block: var(--space-md);
	}
	svg {
		width: min(100%, var(--admin-editor-width));
		height: auto;
	}
	svg text {
		fill: var(--color-text);
		font: var(--font-small) var(--font-mono);
	}
	rect {
		fill: var(--kind-fill);
	}
	.donut {
		max-width: calc(var(--admin-editor-width) / 2);
	}
	circle {
		fill: none;
		stroke: var(--kind-fill);
		stroke-width: 15;
	}
	.track {
		stroke: var(--color-border);
	}
	.skipped {
		overflow-wrap: anywhere;
	}
</style>
