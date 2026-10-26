<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import NextShift from '#lib/components/NextShift.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { formatNumber } from '#lib/format.ts';
	import { weekdays } from '#lib/weekdays.ts';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	onMount(() => {
		const reload = () => {
			void invalidate('app:profile');
		};
		return listenRealtime((event) => {
			if (event.type !== 'log_created') reload();
		}, reload);
	});
</script>

<svelte:head><title>{m.nav_profile()} — {m.app_name()}</title></svelte:head>
<h1 class="sr-only">{m.nav_profile()}</h1>
{#if data.nextShift}<NextShift shift={data.nextShift} />{/if}
<div class="profile-layout">
	<section class="profile" aria-label={m.nav_profile()}>
		<div class="identity">
			<Avatar
				login={data.profile.user.login}
				name={data.profile.user.displayName || data.profile.user.login}
				hasImage={data.profile.user.hasImage}
			/>
			<div>
				<h2>{data.profile.user.displayName || data.profile.user.login}</h2>
				<p>@{data.profile.user.login}</p>
			</div>
		</div>
		<dl>
			<div class="profile_wallet">
				<dt>{m.profile_wallet()}</dt>
				<dd>{formatNumber(data.profile.user.wallet)}₳</dd>
			</div>
			<div class="profile_total_events">
				<dt>{m.profile_total_events()}</dt>
				<dd>{formatNumber(data.profile.totalEvents)}</dd>
			</div>
			<div class="profile_hours">
				<dt>{m.profile_hours()}</dt>
				<dd>{formatNumber(data.profile.hours)}</dd>
			</div>
			<div class="profile_earned">
				<dt>{m.profile_earned()}</dt>
				<dd>{formatNumber(data.profile.altarian)}₳</dd>
			</div>
		</dl>
		<p class="totals-hint">{m.profile_totals_hint()}</p>
	</section>
	<div class="weeks">
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
								><th scope="col">{m.profile_time()}</th><th scope="col" class="number"
									>{m.profile_compensation()}</th
								><th scope="col" class="number">{m.profile_status()}</th></tr
							></thead
						>
						<tbody
							>{#each week.events as event, index (index)}
								{@const status = !event.passed ? 'planned' : event.attended ? 'attended' : 'absent'}
								<tr class:absent={status === 'absent'}
									><th scope="row">{event.title}</th><td>{weekdays[event.weekday - 1]()}</td><td
										>{event.formattedDate || m.reports_no_date()}</td
									><td>{event.startTime}–{event.endTime}</td><td class="number amount"
										>{formatNumber(event.compensation)}₳</td
									><td class="number"
										><span class="status" data-status={status}
											>{status === 'planned'
												? m.profile_planned()
												: status === 'attended'
													? m.profile_attended()
													: m.profile_absent()}</span
										></td
									></tr
								>
							{/each}</tbody
						>
					</table>
				</div>
			</section>
		{/each}
	</div>
</div>

<style>
	.profile-layout {
		display: grid;
		grid-template-columns: var(--profile-aside-width) minmax(0, 1fr);
		gap: var(--space-xl);
		align-items: start;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
	}
	.identity h2 {
		margin: 0;
		font-size: var(--font-profile-title);
		line-height: 1.05;
	}
	.identity p {
		margin: 0;
		color: var(--color-signal-text);
		font: var(--font-small) var(--font-mono);
	}
	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		margin: 0;
	}
	dl > div {
		padding: var(--space-md);
		border: var(--border-width) solid var(--color-border);
		background: var(--color-surface);
		border-radius: var(--radius);
	}
	.profile_wallet {
		order: 4;
	}
	.profile_earned {
		border: var(--border-strong) solid var(--color-signal);
	}
	dt {
		font-size: var(--font-small);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		color: var(--color-muted);
		text-transform: uppercase;
	}
	dd {
		margin: var(--space-sm) 0 0;
		font: 600 var(--font-mono-lg) var(--font-mono);
	}
	.totals-hint {
		margin-block: var(--space-md) 0;
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	.weeks section {
		margin-bottom: var(--space-lg);
	}
	.weeks h2 {
		margin: 0 0 var(--space-sm);
		padding-bottom: var(--space-sm);
		border-bottom: var(--border-strong) solid var(--color-text);
		font-size: var(--font-section);
	}
	.number {
		text-align: end;
	}
	.status {
		display: inline-block;
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-pill);
		font: 700 var(--font-tiny) var(--font-body);
		white-space: nowrap;
		background: var(--color-raised);
		color: var(--color-text);
	}
	.status[data-status='attended'] {
		background: var(--color-ok-bg);
		color: var(--color-ok);
	}
	.status[data-status='absent'] {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}
	.absent th,
	.absent td:not(:last-child) {
		color: var(--color-muted);
	}
	.absent .amount {
		text-decoration: line-through;
	}
	td {
		font-family: var(--font-mono);
		font-size: var(--font-small);
	}
	.weeks th,
	.weeks td {
		white-space: nowrap;
	}
	@media (max-width: 1023px) {
		.profile-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 767px) {
		.weeks th,
		.weeks td {
			padding: var(--space-sm);
		}
	}
</style>
