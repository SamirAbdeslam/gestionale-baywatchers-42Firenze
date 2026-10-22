<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/format.ts';
	import { weekdays } from '#lib/weekdays.ts';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.nav_profile()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_profile()}</h1>
<section aria-label={m.nav_profile()}>
	{#if data.profile.user.imageUrl}
		<img
			src={data.profile.user.imageUrl}
			alt={m.profile_image({ name: data.profile.user.displayName || data.profile.user.login })}
		/>
	{/if}
	<h2>{data.profile.user.displayName || data.profile.user.login}</h2>
	<p>@{data.profile.user.login}</p>
	<dl>
		<dt>{m.profile_wallet()}</dt>
		<dd>{formatNumber(data.profile.user.wallet)}₳</dd>
		<dt>{m.profile_total_events()}</dt>
		<dd>{formatNumber(data.profile.totalEvents)}</dd>
		<dt>{m.profile_hours()}</dt>
		<dd>{formatNumber(data.profile.hours)}</dd>
		<dt>{m.profile_earned()}</dt>
		<dd>{formatNumber(data.profile.altarian)}₳</dd>
	</dl>
</section>
{#if !data.profile.weeks.length}<p>{m.profile_empty()}</p>{/if}
{#each data.profile.weeks as week (week.week)}
	<section aria-label={m.reports_week({ week: week.week })}>
		<h2>{m.reports_week({ week: week.week })}</h2>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontally scrollable table.) -->
		<div
			class="table-wrap"
			role="region"
			aria-label={m.profile_week_events({ week: week.week })}
			tabindex="0"
		>
			<table>
				<thead
					><tr
						><th scope="col">{m.profile_event()}</th><th scope="col">{m.profile_day()}</th><th
							scope="col">{m.profile_date()}</th
						><th scope="col">{m.profile_time()}</th><th scope="col">{m.profile_compensation()}</th
						><th scope="col">{m.profile_status()}</th></tr
					></thead
				>
				<tbody
					>{#each week.events as event, index (index)}
						<tr class:absent={!event.attended}
							><th scope="row">{event.title}</th><td>{weekdays[event.weekday - 1]()}</td><td
								>{event.formattedDate || m.reports_no_date()}</td
							><td>{event.startTime}–{event.endTime}</td><td>{formatNumber(event.compensation)}₳</td
							><td>{event.attended ? m.profile_attended() : m.profile_absent()}</td></tr
						>
					{/each}</tbody
				>
			</table>
		</div>
	</section>
{/each}

<style>
	img {
		width: var(--profile-image-size);
		height: var(--profile-image-size);
		max-width: 100%;
		object-fit: cover;
		border-radius: var(--radius);
	}
	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: var(--space-sm);
		max-width: 100%;
	}
	dd {
		margin: 0;
	}
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
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
	.absent {
		opacity: var(--opacity-muted);
	}
</style>
