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
	const dateTime = (date: Date) =>
		new Intl.DateTimeFormat(getLocale(), {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Europe/Rome'
		}).format(date);
</script>

<svelte:head><title>{m.nav_participants()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_participants()}</h1>
<p class="downloads">
	<a href={resolve('/admin/participants/summary.csv')} download>{m.reports_summary_csv()}</a><a
		href={resolve('/admin/participants/detailed.csv')}
		download>{m.reports_detailed_csv()}</a
	>
</p>
<label for="search">{m.reports_search()}</label><input
	id="search"
	type="search"
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
					><th scope="col">{m.reports_login()}</th><th scope="col">{m.reports_events()}</th><th
						scope="col">{m.reports_hours()}</th
					><th scope="col">{m.reports_altarian()}</th><th scope="col">{m.reports_details()}</th></tr
				></thead
			>
			<tbody
				>{#each participants as p (p.login)}
					<tr
						><th scope="row">{p.login}</th><td>{formatNumber(p.events)}</td><td
							>{formatNumber(p.hours)}</td
						><td>{formatNumber(p.altarian)}</td>
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
													<strong>{event.title}</strong>
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
															>{dateTime(event.registeredAt)}</time
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
{/if}

<style>
	.downloads {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
		margin-block: var(--space-md);
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: var(--space-sm);
		text-align: start;
		vertical-align: top;
		border-block-end: var(--border-width) solid var(--color-text);
	}
	details {
		margin-block: var(--space-sm);
	}
	h2 {
		font-size: inherit;
	}
	ul {
		padding-left: var(--space-md);
	}
	li {
		margin-block: var(--space-md);
	}
</style>
