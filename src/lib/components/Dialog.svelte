<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let {
		label,
		title,
		children,
		open = false,
		icon = false,
		closeLabel = m.admin_cancel()
	}: {
		label: string;
		title: string;
		children: Snippet;
		open?: boolean;
		icon?: boolean | 'add' | 'edit' | 'delete';
		closeLabel?: string;
	} = $props();
	let dialog = $state<HTMLDialogElement>();
	let confirm = $state<HTMLDialogElement>();
	let enhanced = $state(false);
	let dragging = $state(false);
	// Bumped to re-render the content, which drops unsaved edits.
	let generation = $state(0);
	let dirty = false;
	onMount(() => (enhanced = true));
	$effect(() => {
		if (open && dialog) {
			if (dialog.open) dialog.close();
			dialog.showModal();
		}
	});
	const id = $props.id();

	function requestClose() {
		if (dirty) confirm?.showModal();
		else dialog?.close();
	}
	function discard() {
		confirm?.close();
		dialog?.close();
	}
	function closed() {
		if (dirty) generation += 1;
		dirty = false;
		dialog?.style.removeProperty('translate');
	}
	function backdropClick(event: MouseEvent) {
		if (!dialog || event.target !== dialog) return;
		const box = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (!inside) requestClose();
	}

	// Mobile sheet: dragging the handle or the header down closes it.
	let startY = 0;
	let startTime = 0;
	let offset = 0;
	function dragStart(event: PointerEvent) {
		if (!dialog || !matchMedia('(max-width: 767px)').matches) return;
		if ((event.target as Element).closest('button, a, input, select, textarea')) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		startY = event.clientY;
		startTime = event.timeStamp;
		offset = 0;
		dragging = true;
	}
	function dragMove(event: PointerEvent) {
		if (!dragging || !dialog) return;
		offset = Math.max(0, event.clientY - startY);
		dialog.style.translate = `0 ${offset}px`;
	}
	function dragEnd(event: PointerEvent) {
		if (!dragging || !dialog) return;
		dragging = false;
		const speed = offset / Math.max(1, event.timeStamp - startTime);
		dialog.style.removeProperty('translate');
		if (offset > dialog.offsetHeight / 3 || speed > 0.6) requestClose();
	}
</script>

<button
	hidden={open}
	class:icon-button={icon}
	type="button"
	commandfor={id}
	command="show-modal"
	aria-label={label}
>
	{#if icon}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
			{#if icon === 'add'}<path d="M12 4v16M4 12h16" />
			{:else if icon === 'edit'}<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z" />
			{:else if icon === 'delete'}<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
			{:else}<rect x="3" y="5" width="18" height="16" rx="2" /><path
					d="M3 10h18M8 3v4m8-4v4M9 15h6m-3-3v6"
				/>{/if}
		</svg>{:else}{label}{/if}</button
>
<dialog
	{id}
	{open}
	class:enhanced
	class:dragging
	bind:this={dialog}
	aria-label={title}
	oninput={() => (dirty = true)}
	onchange={() => (dirty = true)}
	onsubmit={(event) => {
		dirty = false;
		event.currentTarget.close();
	}}
	oncancel={(event) => {
		if (!dirty) return;
		event.preventDefault();
		confirm?.showModal();
	}}
	onclose={closed}
	onclick={backdropClick}
>
	<!-- svelte-ignore a11y_no_static_element_interactions (The drag gesture is a pointer shortcut; Escape and the backdrop close the sheet too.) -->
	<header
		class="sheet-head"
		onpointerdown={dragStart}
		onpointermove={dragMove}
		onpointerup={dragEnd}
		onpointercancel={dragEnd}
	>
		<span class="handle" aria-hidden="true"></span>
		<h3>{title}</h3>
	</header>
	{#key generation}{@render children()}{/key}
	<button class="dialog-close" type="button" commandfor={id} command="close">{closeLabel}</button>
</dialog>
{#if enhanced}
	<dialog class="discard" bind:this={confirm} aria-label={m.dialog_discard_title()}>
		<p>{m.dialog_discard_title()}</p>
		<div class="discard-actions">
			<button class="danger" type="button" onclick={discard}>{m.dialog_discard()}</button>
			<!-- svelte-ignore a11y_autofocus (Keep the safe choice under the keyboard, not «Discard».) -->
			<button class="secondary" type="button" autofocus onclick={() => confirm?.close()}
				>{m.dialog_keep_editing()}</button
			>
		</div>
	</dialog>
{/if}

<style>
	dialog {
		--ticket-stub-width: var(--ticket-stub-dialog);
		width: var(--dialog-width);
		max-width: calc(100% - var(--space-lg));
		max-height: calc(100% - var(--space-lg));
		overflow: auto;
		color: var(--color-text);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		padding: var(--space-lg);
	}
	/* Without JavaScript the dialog opens with the open attribute, outside the top layer. */
	dialog[open]:not(:modal) {
		position: fixed;
		inset: 0;
		z-index: var(--layer-overlay);
	}
	dialog::backdrop {
		background: var(--color-backdrop);
	}
	dialog :global(form) {
		width: 100%;
	}
	.handle {
		display: none;
	}
	.discard {
		width: min(var(--dialog-width), calc(100% - 2 * var(--space-md)));
		margin: auto;
		border-radius: var(--radius-panel);
	}
	.discard p {
		font: 700 var(--font-section) var(--font-heading);
	}
	.discard-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	@media (max-width: 767px) {
		dialog:not(.discard) {
			margin: auto 0 0;
			max-width: 100%;
			width: 100%;
			border-radius: var(--radius-panel) var(--radius-panel) 0 0;
			padding: var(--space-lg) var(--space-md);
			padding-bottom: calc(var(--space-lg) + env(safe-area-inset-bottom));
		}
		.sheet-head {
			margin: calc(-1 * var(--space-lg)) calc(-1 * var(--space-md)) 0;
			padding: var(--space-md) var(--space-md) 0;
			touch-action: none;
			cursor: grab;
		}
		.handle {
			display: block;
			margin: 0 auto var(--space-md);
			width: var(--dialog-handle-width);
			height: var(--brand-bar);
			border-radius: var(--radius-pill);
			background: var(--color-border);
		}
		/* The handle replaces «Cancel» on phones; without JavaScript the button stays. */
		.enhanced:has(:global(form)) > .dialog-close {
			display: none;
		}
	}
	/* Only the opening animates: a closing dialog leaves at once, so nothing lingers on screen. */
	@media (prefers-reduced-motion: no-preference) {
		dialog,
		dialog::backdrop {
			transition:
				opacity var(--duration-fast) ease,
				transform var(--duration-spring) var(--ease-spring),
				translate var(--duration-spring) var(--ease-spring);
		}
		dialog.dragging {
			transition: none;
		}
		@starting-style {
			dialog[open],
			dialog[open]::backdrop {
				opacity: 0;
			}
			dialog[open] {
				transform: scale(0.96);
			}
		}
		@media (max-width: 767px) {
			@starting-style {
				dialog:not(.discard)[open] {
					opacity: 1;
					transform: translateY(100%);
				}
			}
		}
	}
</style>
