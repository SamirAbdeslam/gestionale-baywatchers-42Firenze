<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { formatNumber, poolName } from '#lib/format.ts';
	import { weekdays } from '#lib/weekdays.ts';
	import type { getRecap } from '#lib/server/domain/recap.ts';
	let { recap }: { recap: Awaited<ReturnType<typeof getRecap>> } = $props();
	let ready = $state(false);
	let index = $state(0);
	const progress = new Tween(1, { duration: 650 });
	const stats = $derived(recap?.stats);
	const totals = $derived(recap?.totals);
	const screens = $derived(
		!recap
			? []
			: recap.whole
				? ['together']
				: [
						'intro',
						...(stats?.completed ? ['favorite'] : []),
						...(stats &&
						(stats.favoriteWeekday !== null ||
							stats.favoriteTimeBand !== null ||
							stats.busiestWeek !== null)
							? ['rhythm']
							: []),
						...(stats?.firstShift ? ['first-last'] : []),
						...(stats && stats.taken > 0 && stats.attendancePercent >= 80 ? ['attendance'] : []),
						...(totals?.minutes ? ['contribution'] : []),
						...(stats?.badges.length ? ['badges'] : []),
						'together'
					]
	);
	const labels = {
		exam: m.event_kind_exam,
		icebreaker: m.event_kind_icebreaker,
		rush: m.event_kind_rush,
		cluster: m.event_kind_cluster,
		welcome: m.event_kind_welcome,
		custom: m.event_kind_custom
	};
	const bands = {
		morning: m.recap_morning,
		afternoon: m.recap_afternoon,
		evening: m.recap_evening
	};
	const badges = {
		early_bird: m.recap_early_bird,
		all_rounder: m.recap_all_rounder,
		always_there: m.recap_always_there
	};
	const number = (value: number, precision = 0) =>
		formatNumber(Math.round(value * progress.current * 10 ** precision) / 10 ** precision);
	const date = (value: string) =>
		new Intl.DateTimeFormat(getLocale(), {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Rome'
		}).format(new Date(`${value}T12:00:00Z`));
	onMount(() => {
		ready = true;
	});
	$effect(() => {
		// Restart only the current screen, and keep static server-rendered values intact.
		void index;
		void recap;
		if (!ready) return;
		if (prefersReducedMotion.current) {
			void progress.set(1, { duration: 0 });
			return;
		}
		void progress.set(0, { duration: 0 });
		void progress.set(1);
		return () => {
			void progress.set(1, { duration: 0 });
		};
	});
	$effect(() => {
		if (index >= screens.length) index = Math.max(0, screens.length - 1);
	});
	function move(step: number) {
		index = Math.max(0, Math.min(screens.length - 1, index + step));
	}
	function keyboard(event: KeyboardEvent) {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			move(1);
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			move(-1);
		}
	}
</script>

{#if !recap}<p>{m.recap_empty()}</p>
{:else}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Arrow keys navigate the recap screens.) -->
	<div
		class="recap"
		class:enhanced={ready}
		role="region"
		aria-label={m.recap_title()}
		tabindex="0"
		onkeydown={keyboard}
	>
		{#if ready && screens.length > 1}
			<nav aria-label={m.recap_title()}>
				<button type="button" onclick={() => move(-1)} disabled={index === 0}
					>{m.recap_previous()}</button
				>
				<span aria-live="polite"
					>{m.recap_progress({
						current: formatNumber(index + 1),
						total: formatNumber(screens.length)
					})}</span
				>
				<button type="button" onclick={() => move(1)} disabled={index === screens.length - 1}
					>{m.recap_next()}</button
				>
			</nav>
		{/if}
		{#each screens as screen, i (screen)}
			<section class="screen" hidden={ready && index !== i} data-screen={screen}>
				{#if screen === 'intro' && stats}
					<h2>{m.recap_intro({ pool: poolName(recap.startDate) })}</h2>
					<dl class="numbers">
						<div>
							<dt>{m.archive_completed()}</dt>
							<dd>{number(stats.completed)}</dd>
						</div>
						<div>
							<dt>{m.reports_hours()}</dt>
							<dd>{number(stats.hours, 2)}</dd>
						</div>
						<div>
							<dt>{m.reports_altarian()}</dt>
							<dd>{number(stats.altarian)} ₳</dd>
						</div>
					</dl>
				{:else if screen === 'favorite' && stats}
					<h2>{m.recap_favorite()}</h2>
					<p class="highlight">
						{labels[[...stats.byKind].sort((a, b) => b.count - a.count)[0].kind]()}
					</p>
					{@render kinds(stats.byKind)}
				{:else if screen === 'rhythm' && stats}
					<h2>{m.recap_rhythm()}</h2>
					{#if stats.favoriteWeekday !== null}<p class="highlight">
							{weekdays[stats.favoriteWeekday - 1]()}
						</p>{/if}
					{#if stats.favoriteTimeBand}<p>{bands[stats.favoriteTimeBand]()}</p>{/if}
					{#if stats.busiestWeek !== null && stats.weekCounts}
						<h3>{m.recap_week({ week: formatNumber(stats.busiestWeek) })}</h3>
						<svg viewBox="0 0 320 180" role="img" aria-label={m.recap_weeks()}>
							<title>{m.recap_weeks()}</title>
							{#each stats.weekCounts as week, j (week.week)}
								<rect
									x={j * 80 + 15}
									y={140 -
										(week.count / Math.max(...stats.weekCounts.map((w) => w.count), 1)) *
											110 *
											progress.current}
									width="45"
									height={(week.count / Math.max(...stats.weekCounts.map((w) => w.count), 1)) *
										110 *
										progress.current}
								/>
								<text x={j * 80 + 36} y="165" text-anchor="middle">{formatNumber(week.week)}</text>
								<text x={j * 80 + 36} y="20" text-anchor="middle">{formatNumber(week.count)}</text>
							{/each}
						</svg>
					{/if}
				{:else if screen === 'first-last' && stats}
					<h2>{m.recap_first_last()}</h2>
					{#each [{ label: m.recap_first(), shift: stats.firstShift }, { label: m.recap_last(), shift: stats.lastShift }] as item (item.label)}
						{#if item.shift?.eventDate}<h3>{item.label}</h3>
							<p>{item.shift.title}</p>
							<p>
								{date(item.shift.eventDate)}{item.shift.startTime
									? ` · ${item.shift.startTime.slice(0, 5)}`
									: ''}
							</p>{/if}
					{/each}
				{:else if screen === 'attendance' && stats}
					<h2>{m.reports_attendance()}</h2>
					<p class="highlight">
						{m.recap_attendance({
							completed: number(stats.completed),
							taken: formatNumber(stats.taken)
						})}
					</p>
				{:else if screen === 'contribution' && stats}
					<h2>{m.recap_contribution()}</h2>
					<p class="highlight">
						{m.recap_percent({ percent: number(stats.contributionPercent, 2) })}
					</p>
				{:else if screen === 'badges' && stats}
					<h2>{m.recap_badges()}</h2>
					<ul>
						{#each stats.badges as badge (badge)}<li class="highlight">{badges[badge]()}</li>{/each}
					</ul>
				{:else if screen === 'together' && totals}
					<h2>{m.recap_together()} — {poolName(recap.startDate)}</h2>
					<dl class="numbers">
						<div>
							<dt>{m.archive_taken()}</dt>
							<dd>{number(totals.taken)}</dd>
						</div>
						<div>
							<dt>{m.archive_completed()}</dt>
							<dd>{number(totals.completed)}</dd>
						</div>
						<div>
							<dt>{m.reports_hours()}</dt>
							<dd>{number(totals.hours, 2)}</dd>
						</div>
						<div>
							<dt>{m.reports_altarian()}</dt>
							<dd>{number(totals.altarian)} ₳</dd>
						</div>
						<div>
							<dt>{m.nav_participants()}</dt>
							<dd>{number(totals.participants)}</dd>
						</div>
						<div>
							<dt>{m.reports_attendance()}</dt>
							<dd>{number(totals.attendancePercent, 2)}%</dd>
						</div>
					</dl>
					{@render kinds(totals.byKind)}
				{/if}
			</section>
		{/each}
	</div>
{/if}

{#snippet kinds(items: NonNullable<typeof totals>['byKind'])}
	<div class="charts">
		<svg class="donut" viewBox="0 0 120 120" role="img" aria-label={m.archive_kind_share()}>
			<title>{m.archive_kind_share()}</title><circle class="track" cx="60" cy="60" r="45" />
			{#each items as item, i (item.kind)}
				<circle
					data-kind={item.kind}
					cx="60"
					cy="60"
					r="45"
					pathLength="100"
					stroke-dasharray={`${item.percent * progress.current} ${100 - item.percent * progress.current}`}
					stroke-dashoffset={-items.slice(0, i).reduce((sum, kind) => sum + kind.percent, 0)}
					transform="rotate(-90 60 60)"
				>
					<title
						>{labels[item.kind]()} {formatNumber(item.count)} · {formatNumber(item.percent)}%</title
					>
				</circle>
			{/each}
		</svg>
		<ul>
			{#each items.filter((item) => item.count > 0) as item (item.kind)}<li>
					{labels[item.kind]()} · {formatNumber(item.count)} · {formatNumber(item.percent)}%
				</li>{/each}
		</ul>
	</div>
{/snippet}

<style>
	.recap {
		min-width: 0;
		margin-block: var(--space-lg);
	}
	.screen {
		min-height: 80svh;
		padding: var(--space-lg);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius);
		margin-block: var(--space-md);
		overflow-wrap: anywhere;
	}
	.screen[hidden] {
		display: none;
	}
	.screen:not([hidden]) {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	nav span {
		font-family: var(--font-mono);
		font-size: var(--font-small);
	}
	h2 {
		font-size: var(--font-title-mobile);
	}
	.highlight,
	dd {
		font: 600 var(--font-section) var(--font-mono);
		color: var(--color-signal-text);
	}
	.numbers {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-lg);
	}
	dd {
		margin: 0;
	}
	.charts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-md);
	}
	svg {
		width: min(100%, var(--admin-editor-width));
		height: auto;
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
	rect {
		fill: var(--color-signal);
	}
	text {
		fill: var(--color-text);
		font: var(--font-small) var(--font-mono);
	}
	@media (prefers-reduced-motion: no-preference) {
		.enhanced .screen:not([hidden]) {
			animation: arrive 400ms ease-out;
		}
	}
	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(var(--space-md));
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
