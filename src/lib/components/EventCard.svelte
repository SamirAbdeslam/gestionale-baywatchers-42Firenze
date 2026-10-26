<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { EventKind } from '#lib/kinds.ts';
	import { formatNumber } from '#lib/format.ts';
	import { m } from '#lib/paraglide/messages.js';
	let {
		event,
		children,
		actions,
		meta,
		headingLevel = 4,
		orientation = 'auto',
		mine = event.state === 'registered'
	}: {
		event: {
			title: string;
			kind: EventKind;
			startTime: string;
			endTime: string;
			compensation: number;
			state?: string;
			registeredCount?: number;
			maxSlots?: number;
		};
		children?: Snippet;
		actions?: Snippet;
		meta?: Snippet;
		headingLevel?: 2 | 3 | 4;
		orientation?: 'auto' | 'horizontal' | 'vertical';
		mine?: boolean;
	} = $props();
	const labels = {
		exam: m.event_kind_exam,
		icebreaker: m.event_kind_icebreaker,
		rush: m.event_kind_rush,
		cluster: m.event_kind_cluster,
		welcome: m.event_kind_welcome,
		custom: m.event_kind_custom
	};
</script>

<article
	class="ticket"
	class:mine
	class:passed={event.state === 'passed'}
	data-kind={event.kind}
	data-orientation={orientation}
	aria-label={event.title}
>
	<div class="ticket-stub">
		<div class="ghost" aria-hidden="true"></div>
		<span class="sr-only">{labels[event.kind]()}</span>
		<div class="stub-heading">
			<svelte:element this={`h${headingLevel}`} class="ticket-title">{event.title}</svelte:element>
			{#if actions}{@render actions()}{/if}
		</div>
		{#if mine}<span class="owned" aria-hidden="true">{m.ticket_owned()}</span>{/if}
		<div class="stub-time" aria-hidden="true">
			{event.startTime}<small> → {event.endTime}</small>
		</div>
		<span class="sr-only">{event.startTime}–{event.endTime}</span>
	</div>
	<div class="ticket-body">
		<p class="compensation">
			₳ {formatNumber(event.compensation)}
			{#if event.maxSlots !== undefined && event.registeredCount !== undefined}
				· <span
					aria-label={m.calendar_registered_count({
						count: formatNumber(event.registeredCount),
						slots: formatNumber(event.maxSlots)
					})}>{formatNumber(event.registeredCount)}/{formatNumber(event.maxSlots)}</span
				>
			{/if}
			{#if meta}
				· {@render meta()}{/if}
		</p>
		{#if event.maxSlots !== undefined && event.registeredCount !== undefined && event.maxSlots <= 10}
			<div class="seats" aria-hidden="true">
				{#each Array.from({ length: event.maxSlots }, (_, i) => i) as i (i)}
					<span class="seat" class:taken={i < event.registeredCount} class:own={mine && i === 0}
					></span>
				{/each}
			</div>
		{/if}
		{#if children}{@render children()}{/if}
	</div>
</article>

<style>
	.ticket {
		display: flex;
		flex-direction: column;
		margin-block: var(--space-md);
		min-width: 0;
	}
	.ticket.passed {
		opacity: var(--opacity-muted);
	}
	.ticket-stub {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		padding: var(--ticket-padding);
		border-radius: var(--radius) var(--radius) 0 0;
		color: var(--kind-ink);
		background-color: var(--kind-fill);
		mask: radial-gradient(
				circle at 50% 100%,
				transparent var(--ticket-hole-radius),
				black var(--ticket-hole-soft)
			)
			0 0 / var(--ticket-hole-step) 100% repeat-x;
	}
	.stub-heading {
		display: flex;
		align-items: start;
		flex-wrap: wrap;
		gap: var(--space-xs);
		min-width: 0;
	}
	.stub-heading .ticket-title {
		flex: 1 1 var(--ticket-stub-width);
		min-width: 0;
		margin: 0;
		font: 700 var(--font-size-body)/1.2 var(--font-heading);
		letter-spacing: normal;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.owned {
		font: 700 var(--font-ticket-label) var(--font-body);
		text-transform: uppercase;
	}
	.stub-time {
		font: 600 var(--font-ticket-time) var(--font-mono);
		white-space: nowrap;
	}
	.stub-time small {
		font-size: var(--font-label);
		font-weight: 400;
	}
	.ticket-body {
		display: flex;
		flex-direction: column;
		gap: var(--ticket-gap);
		padding: var(--ticket-padding);
		background: var(--color-surface);
		border-radius: 0 0 var(--radius) var(--radius);
		mask: radial-gradient(
				circle at 50% 0,
				transparent var(--ticket-hole-radius),
				black var(--ticket-hole-soft)
			)
			0 0 / var(--ticket-hole-step) 100% repeat-x;
		min-width: 0;
	}
	.compensation {
		color: var(--color-muted);
		font: var(--font-label) var(--font-mono);
		margin: 0;
	}
	.seats {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
	.seat {
		width: var(--seat-size);
		height: var(--seat-size);
		border: var(--border-strong) solid var(--color-border);
		border-radius: var(--radius-seat);
	}
	.seat.taken {
		background: var(--color-text);
		border-color: var(--color-text);
	}
	.seat.own {
		background: var(--color-signal);
		border-color: var(--color-signal);
	}
	.ghost {
		background-origin: border-box;
		display: none;
		position: absolute;
		inset: 0;
		border: var(--border-strong) dashed var(--color-signal);
		border-bottom: 0;
		border-radius: inherit;
		background: linear-gradient(
				90deg,
				var(--color-signal) var(--border-strong),
				transparent var(--border-strong) calc(var(--ticket-hole-step) - var(--border-strong)),
				var(--color-signal) calc(var(--ticket-hole-step) - var(--border-strong))
			)
			0 100% / var(--ticket-hole-step) var(--border-strong) repeat-x;
		pointer-events: none;
	}
	.mine .ghost {
		background-origin: border-box;
		display: block;
	}
	.mine .ticket-stub {
		background-color: var(--color-ghost-fill);
		color: var(--color-signal-text);
	}
	.ticket-body :global(p),
	.ticket-body :global(form) {
		margin: 0;
	}
	.ticket-body :global(button),
	.ticket-body :global(.button) {
		min-height: var(--control-height-sm);
		width: 100%;
	}
	.ticket-body :global(.icon-button) {
		width: var(--control-height-sm);
		height: var(--control-height-sm);
	}
	.ticket-body :global(ul) {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}
	.ticket[data-orientation='horizontal'] {
		flex-direction: row;
	}
	.ticket[data-orientation='horizontal'] .ticket-stub {
		padding-inline: var(--ticket-stub-inline-padding);
		width: var(--ticket-stub-width);
		flex-shrink: 0;
		border-radius: var(--radius-panel) 0 0 var(--radius-panel);
		mask: radial-gradient(
				circle at 100% 50%,
				transparent var(--ticket-hole-radius),
				black var(--ticket-hole-soft)
			)
			0 0 / 100% var(--ticket-hole-step) repeat-y;
	}
	.ticket[data-orientation='horizontal'] .ticket-body {
		flex: 1;
		border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
		mask: radial-gradient(
				circle at 0 50%,
				transparent var(--ticket-hole-radius),
				black var(--ticket-hole-soft)
			)
			0 0 / 100% var(--ticket-hole-step) repeat-y;
	}
	.ticket[data-orientation='horizontal'] .ghost {
		background-origin: border-box;
		border-bottom: var(--border-strong) dashed var(--color-signal);
		border-right: 0;
		background: linear-gradient(
				180deg,
				var(--color-signal) var(--border-strong),
				transparent var(--border-strong) calc(var(--ticket-hole-step) - var(--border-strong)),
				var(--color-signal) calc(var(--ticket-hole-step) - var(--border-strong))
			)
			100% 0 / var(--border-strong) var(--ticket-hole-step) repeat-y;
	}
	.ticket[data-orientation='horizontal'] .stub-time small {
		display: block;
	}
	@media (max-width: 767px) {
		.ticket[data-orientation='auto'] {
			flex-direction: row;
		}
		.ticket[data-orientation='auto'] .ticket-stub {
			padding-inline: var(--ticket-stub-inline-padding);
			width: var(--ticket-stub-width);
			flex-shrink: 0;
			border-radius: var(--radius-panel) 0 0 var(--radius-panel);
			mask: radial-gradient(
					circle at 100% 50%,
					transparent var(--ticket-hole-radius),
					black var(--ticket-hole-soft)
				)
				0 0 / 100% var(--ticket-hole-step) repeat-y;
		}
		.ticket[data-orientation='auto'] .ticket-body {
			flex: 1;
			border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
			mask: radial-gradient(
					circle at 0 50%,
					transparent var(--ticket-hole-radius),
					black var(--ticket-hole-soft)
				)
				0 0 / 100% var(--ticket-hole-step) repeat-y;
		}
		.ticket[data-orientation='auto'] .ghost {
			background-origin: border-box;
			border-bottom: var(--border-strong) dashed var(--color-signal);
			border-right: 0;
			background: linear-gradient(
					180deg,
					var(--color-signal) var(--border-strong),
					transparent var(--border-strong) calc(var(--ticket-hole-step) - var(--border-strong)),
					var(--color-signal) calc(var(--ticket-hole-step) - var(--border-strong))
				)
				100% 0 / var(--border-strong) var(--ticket-hole-step) repeat-y;
		}
		.ticket[data-orientation='auto'] .stub-time small {
			display: block;
		}
	}
</style>
