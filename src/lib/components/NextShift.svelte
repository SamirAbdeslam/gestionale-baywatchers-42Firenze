<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { weekdays } from '#lib/weekdays.ts';
	import { formatNumber } from '#lib/format.ts';
	import type { nextShift } from '#lib/server/domain/reports.ts';
	let {
		shift
	}: { shift: NonNullable<Awaited<ReturnType<typeof nextShift>>> & { formattedDate: string } } =
		$props();
</script>

<section class="next-shift" aria-label={m.shift_next_title()} data-kind={shift.kind}>
	<div class="heading">
		<h2>{m.shift_next_title()}</h2>
		<h3>{shift.title}</h3>
	</div>
	<p>
		{m.calendar_week({ week: formatNumber(shift.week) })} · {weekdays[shift.weekday - 1]()}
		{shift.formattedDate} · <span class="mono">{shift.startTime}–{shift.endTime}</span>
	</p>
	{#if shift.date !== null}
		<a href={resolve('/events/[id]/calendar.ics', { id: String(shift.id) })}>{m.calendar_ics()}</a>
	{/if}
</section>

<style>
	.next-shift {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm) var(--space-md);
		padding: var(--space-sm);
		margin-bottom: var(--space-sm);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-inline-start: var(--border-strong) solid var(--color-signal);
		border-radius: var(--radius);
	}
	.heading {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: var(--space-sm);
		min-width: 0;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		font: 700 var(--font-small) var(--font-body);
		color: var(--color-signal-text);
	}
	h3 {
		font-size: var(--font-size-body);
	}
</style>
