<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatNumber } from '#lib/format.ts';
	import { weekdays } from '#lib/weekdays.ts';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let query = $state('');
	let participants = $derived(
		data.participants.filter((p) => p.login.includes(query.trim().toLowerCase()))
	);
	const formatter = new Intl.DateTimeFormat(getLocale(), {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Europe/Rome'
	});
</script>

<svelte:head><title>{m.nav_participants()} — {m.app_name()}</title></svelte:head>
<div class="page-head">
	<div>
		<h1>{m.nav_participants()}</h1>
		<p class="totals">
			{m.reports_totals({
				people: formatNumber(data.participants.length),
				hours: formatNumber(data.participants.reduce((sum, p) => sum + p.hours, 0)),
				altarian: formatNumber(data.participants.reduce((sum, p) => sum + p.altarian, 0))
			})}
		</p>
	</div>
	<p class="downloads">
		<a class="button secondary" href={resolve('/admin/participants/summary.csv')} download
			>{m.reports_summary_csv()}</a
		><a class="button" href={resolve('/admin/participants/detailed.csv')} download
			>{m.reports_detailed_csv()}</a
		>
	</p>
</div>
<label class="sr-only" for="search">{m.reports_search()}</label><input
	id="search"
	type="search"
	placeholder={m.reports_search()}
	bind:value={query}
/>
{#if !data.participants.length}<p>{m.reports_empty()}</p>
{:else if !participants.length}<p>{m.reports_no_matches()}</p>
{:else}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontally scrollable table.) -->
	<div class="table-wrap" role="region" aria-label={m.nav_participants()} tabindex="0">
		<table>
			<thead
				><tr
					><th scope="col">{m.reports_login()}</th><th scope="col">{m.reports_attendance()}</th><th
						scope="col">{m.reports_events()}</th
					><th scope="col">{m.reports_hours()}</th><th scope="col">{m.reports_altarian()}</th><th
						scope="col">{m.reports_details()}</th
					></tr
				></thead
			>
			<tbody
				>{#each participants as p (p.login)}
					<tr
						><th scope="row">{p.login}</th><td class="squares"
							>{#each p.weeks as week (week.week)}{#each week.events as event, index (index)}<span
										class="attendance-square"
										class:absent={!event.attended}
										aria-hidden="true"
									></span>{/each}{/each}</td
						><td>{formatNumber(p.events)}</td><td>{formatNumber(p.hours)}</td><td
							>{formatNumber(p.altarian)}</td
						>
						<td>
							<a href={resolve('/admin/participants/[login].csv', { login: p.login })} download
								>{m.reports_participant_csv()}</a
							>
							<details>
								<summary>{m.reports_details()}</summary>
								{#each p.weeks as week (week.week)}
									<section aria-label={m.reports_week({ week: week.week })}>
										<h2>{m.reports_week({ week: week.week })}</h2>
										<ul>
											{#each week.events as event, index (index)}<li>
													<span
														class="attendance-square"
														class:absent={!event.attended}
														aria-hidden="true"
													></span><strong>{event.title}</strong>
													<p>
														{weekdays[event.weekday - 1]()}
														{event.formattedDate || m.reports_no_date()} · {event.startTime}–{event.endTime}
													</p>
													<p>
														{m.reports_duration({ hours: formatNumber(event.duration) })} · {#if event.attended}{m.reports_compensation(
																{ amount: formatNumber(event.compensation) }
															)}{:else}<s
																>{m.reports_compensation({
																	amount: formatNumber(event.compensation)
																})}</s
															>{/if}
													</p>
													<p>{event.attended ? m.reports_attended() : m.reports_absent()}</p>
													<p>
														{m.reports_registered_at()}:
														<time datetime={event.registeredAt.toISOString()}
															>{formatter.format(event.registeredAt)}</time
														>
													</p>
												</li>{/each}
										</ul>
									</section>
								{/each}
							</details>
						</td></tr
					>
				{/each}</tbody
			>
		</table>
	</div>
	<p class="legend">{m.reports_legend()}</p>
{/if}

<style>
	.page-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.page-head h1,
	.totals {
		margin: 0;
	}
	.totals {
		color: var(--color-muted);
		font: var(--font-mono-sm) var(--font-mono);
	}
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		margin: 0;
	}
	#search {
		margin-top: var(--space-lg);
		width: min(100%, var(--search-width));
		border-radius: var(--radius-pill);
		font-family: var(--font-mono);
	}
	.table-wrap {
		margin-block: var(--space-md);
	}
	td,
	th[scope='row'] {
		font-family: var(--font-mono);
		font-size: var(--font-mono-sm);
	}
	th[scope='row'],
	td:last-child {
		white-space: nowrap;
	}
	.squares {
		min-width: var(--squares-min-width);
	}
	td {
		vertical-align: middle;
	}
	details {
		display: inline-block;
		margin-inline-start: var(--space-md);
	}
	details[open] {
		display: block;
		white-space: normal;
		margin: var(--space-sm) 0 0;
	}
	summary {
		cursor: pointer;
	}
	h2 {
		font-size: var(--font-small);
		text-transform: uppercase;
		letter-spacing: var(--tracking-label);
		color: var(--color-muted);
	}
	ul {
		padding: 0;
		list-style: none;
	}
	li {
		margin-block: var(--space-sm);
		padding: var(--space-sm);
		border-radius: var(--radius-sm);
		background: var(--color-background);
		font-family: var(--font-body);
	}
	li p {
		margin: 0;
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	.attendance-square {
		display: inline-block;
		width: var(--seat-size);
		height: var(--seat-size);
		border-radius: var(--radius-seat);
		background: var(--color-ok);
		margin-inline-end: var(--space-xs);
		vertical-align: middle;
	}
	.attendance-square.absent {
		background: linear-gradient(
			135deg,
			transparent 40%,
			var(--color-danger) 40% 60%,
			transparent 60%
		);
		border: var(--border-width) solid var(--color-danger);
	}
	.legend {
		color: var(--color-muted);
		font-size: var(--font-small);
	}
</style>
