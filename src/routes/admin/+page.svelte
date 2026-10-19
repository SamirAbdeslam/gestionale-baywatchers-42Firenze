<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const days = [
		m.weekday_1,
		m.weekday_2,
		m.weekday_3,
		m.weekday_4,
		m.weekday_5,
		m.weekday_6,
		m.weekday_7
	];
</script>

<svelte:head><title>{m.nav_admin()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_admin()}</h1>
{#if form?.message}<p role="status">{form.message}</p>{/if}
<dl>
	<dt>{m.admin_active_week()}</dt>
	<dd>{data.settings.activeWeek}</dd>
	<dt>{m.admin_display_week()}</dt>
	<dd>{data.settings.displayWeek}</dd>
	<dt>{m.admin_max_events()}</dt>
	<dd>
		{data.settings.maxEventsPerUser === 0 ? m.admin_unlimited() : data.settings.maxEventsPerUser}
	</dd>
	<dt>{m.admin_pool_start()}</dt>
	<dd>{data.settings.poolStart ?? m.admin_dates_unset()}</dd>
	<dt>{m.admin_pool_end()}</dt>
	<dd>{data.settings.poolEnd ?? m.admin_dates_unset()}</dd>
</dl>
<form method="GET">
	<label for="view-week">{m.admin_view_week()}</label>
	<select id="view-week" name="week" value={data.week}
		>{#each [1, 2, 3, 4] as week (week)}<option value={week}>{week}</option>{/each}</select
	>
	<button type="submit">{m.admin_show_week()}</button>
</form>
<ul aria-label={m.admin_week_dates()}>
	{#each data.dayDates as date, index (index)}<li>
			{days[index]()}
			{date ? data.formattedDayDates[index] : m.admin_dates_unset()}
		</li>{/each}
</ul>
<section aria-labelledby="pool-title">
	<h2 id="pool-title">{m.admin_pool_dates()}</h2>
	<form method="POST" action="?/setPoolDates">
		<label for="pool-start">{m.admin_pool_start()}</label><input
			id="pool-start"
			type="date"
			name="start"
			value={data.settings.poolStart ?? ''}
			required
		/>
		<label for="pool-end">{m.admin_pool_end()}</label><input
			id="pool-end"
			type="date"
			name="end"
			value={data.settings.poolEnd ?? ''}
		/>
		<p>{m.admin_pool_end_hint()}</p>
		<button type="submit">{m.admin_save_pool_dates()}</button>
	</form>
</section>
<section aria-labelledby="active-title">
	<h2 id="active-title">{m.admin_active_week()}</h2>
	<form method="POST" action="?/setActiveWeek">
		<label for="active-week">{m.admin_activate_week()}</label><select
			id="active-week"
			name="week"
			value={data.settings.activeWeek}
			>{#each [1, 2, 3, 4] as week (week)}<option value={week}>{week}</option>{/each}</select
		>
		<button type="submit">{m.admin_activate()}</button>
	</form>
</section>
<section aria-labelledby="limit-title">
	<h2 id="limit-title">{m.admin_max_events()}</h2>
	<form method="POST" action="?/setMaxEvents">
		<label for="max-events">{m.admin_max_events()}</label><input
			id="max-events"
			type="number"
			name="maxEvents"
			min="0"
			max="32767"
			step="1"
			value={data.settings.maxEventsPerUser}
			required
		/>
		<p>{m.admin_max_events_hint()}</p>
		<button type="submit">{m.admin_save_limit()}</button>
	</form>
</section>
<form method="POST" action="?/resetDisplayWeek">
	<button type="submit">{m.admin_reset_display_week()}</button>
</form>
