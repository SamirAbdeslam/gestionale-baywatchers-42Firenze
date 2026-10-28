<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listenRealtime } from '#lib/realtime.ts';
	import type { Notice } from '#lib/components/Toast.svelte';
	import EnrollmentQr from '#lib/components/EnrollmentQr.svelte';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	let projection = $state<HTMLDialogElement>();
	let selected = $state<string[]>([]);
	onMount(() =>
		listenRealtime(
			(event) => {
				if (event.type === 'log_created') void invalidate('app:enrollment');
			},
			() => void invalidate('app:enrollment')
		)
	);
	let feedback: Notice[] = $derived(form?.messages ?? []);
	const recent = $derived(
		feedback.flatMap((message) =>
			message.key === 'whitelist_added' && 'logins' in message.params
				? String(message.params.logins).split(', ')
				: []
		) ?? []
	);
	const dateFormat = new Intl.DateTimeFormat(getLocale(), {
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/Rome'
	});
</script>

<svelte:head><title>{m.nav_whitelist()} — {m.app_name()}</title></svelte:head>
<section class="enrollment" aria-label={m.enrollment_join()}>
	<form method="POST" action="?/enrollment" use:enhance>
		<input type="hidden" name="open" value={data.enrollment.url ? 'no' : 'yes'} />
		<button type="submit" disabled={!data.enrollment.canOpen && !data.enrollment.url}
			>{data.enrollment.url ? m.enrollment_close() : m.enrollment_open()}</button
		>
	</form>
	{#if data.enrollment.url}
		<a
			href={resolve('/admin/enroll')}
			onclick={(event) => {
				event.preventDefault();
				projection?.showModal();
			}}>{m.enrollment_show_qr()}</a
		>
	{/if}
</section>
<dialog
	class="qr-dialog"
	bind:this={projection}
	aria-label={m.enrollment_qr()}
	oncancel={(event) => event.preventDefault()}
>
	<button
		class="close-qr"
		type="button"
		aria-label={m.enrollment_close_qr()}
		onclick={() => projection?.close()}>×</button
	>
	<EnrollmentQr enrollment={data.enrollment} />
</dialog>
<section class="pending" aria-labelledby="pending-title">
	<h2 id="pending-title">{m.enrollment_pending()}</h2>
	{#if data.enrollment.waiting.length}
		<form
			method="POST"
			action="?/review"
			use:enhance={() =>
				async ({ update }) => {
					selected = [];
					await update();
				}}
		>
			<label
				><input
					type="checkbox"
					name="all"
					value="yes"
					checked={data.enrollment.waiting.every((row) => selected.includes(row.login))}
					onchange={(event) => {
						selected = event.currentTarget.checked
							? data.enrollment.waiting.map((row) => row.login)
							: [];
					}}
				/>
				{m.enrollment_select_all()}</label
			>
			<div class="request-list">
				{#each data.enrollment.waiting as row (row.login)}
					<div class="request-row">
						<input type="hidden" name="allLogins" value={row.login} />
						<label
							><input type="checkbox" name="logins" value={row.login} bind:group={selected} />
							@{row.login}</label
						>
						<span>{row.weeks.map((week) => m.enrollment_week({ week })).join(', ')}</span>
						<button type="submit" name="single" value={row.login} formaction="?/approve"
							>{m.enrollment_approve()}</button
						>
						<button type="submit" name="single" value={row.login} formaction="?/reject"
							>{m.enrollment_reject()}</button
						>
					</div>
				{/each}
			</div>
			<button type="submit" name="decision" value="approve"
				>{m.enrollment_approve_selected()}</button
			>
			<button type="submit" name="decision" value="reject">{m.enrollment_reject_selected()}</button>
		</form>
	{:else}<p>{m.enrollment_none()}</p>{/if}
</section>
<section class="week-summary" aria-labelledby="enrollment-weeks">
	<h2 id="enrollment-weeks">{m.enrollment_weeks()}</h2>
	<div class="week-grid">
		{#each data.enrollment.weeks as entry (entry.week)}
			<section aria-label={m.enrollment_week({ week: entry.week })}>
				<h3>{m.enrollment_week({ week: entry.week })}</h3>
				<p>{m.enrollment_week_count({ count: entry.people.length })}</p>
				{#each entry.people as person (person.login + person.state)}<p>
						@{person.login}
						<span class="state-label"
							>{person.state === 'approved'
								? m.enrollment_approved_label()
								: m.enrollment_waiting_label()}</span
						>
					</p>{/each}
			</section>
		{/each}
	</div>
</section>
<div class="whitelist-layout">
	<div class="intro">
		<h1>{m.nav_whitelist()}</h1>
		<p class="lead">{m.whitelist_intro()}</p>
		<form method="POST" action="?/add" use:enhance>
			<label for="logins">{m.whitelist_logins()}</label>
			<textarea id="logins" name="logins" aria-describedby="logins-help" required rows="4"
			></textarea>
			<p id="logins-help">{m.whitelist_help()}</p>
			<button type="submit">{m.whitelist_add()}</button>
		</form>
	</div>
	<section aria-labelledby="whitelist-count">
		<h2 id="whitelist-count">{m.whitelist_count({ count: data.whitelist.length })}</h2>
		{#if data.whitelist.length === 0}
			<p>{m.whitelist_empty()}</p>
		{:else}
			<ul aria-label={m.nav_whitelist()}>
				{#each data.whitelist as row (row.id)}
					<li class:recent={recent.includes(row.login)}>
						<div>
							<strong>@{row.login}</strong>
							<span
								>{recent.includes(row.login) ? m.whitelist_just_added() : m.whitelist_added_at()}
								<time datetime={row.addedAt.toISOString()}>{dateFormat.format(row.addedAt)}</time
								></span
							>
						</div>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="id" value={row.id} />
							<button class="icon-button remove" type="submit" aria-label={m.whitelist_remove()}
								><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
									><path d="M7 7l10 10M17 7 7 17" /></svg
								></button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="note">{m.whitelist_note()}</p>
	</section>
</div>

<style>
	.enrollment {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		flex-wrap: wrap;
	}
	.pending,
	.week-summary {
		margin-bottom: var(--space-lg);
	}
	.request-list {
		display: grid;
		gap: var(--space-sm);
		margin-block: var(--space-md);
	}
	.request-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
		overflow-wrap: anywhere;
	}
	.request-row label {
		margin: 0;
	}
	.week-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		gap: var(--space-md);
	}
	.week-grid section {
		padding: var(--space-md);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		overflow-wrap: anywhere;
	}
	.state-label {
		font-size: var(--font-small);
		color: var(--color-muted);
	}
	.qr-dialog {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100dvh;
		max-width: 100%;
		max-height: 100dvh;
		margin: 0;
		padding: var(--space-lg);
		border: 0;
		background: var(--color-background);
		color: var(--color-text);
	}
	.close-qr {
		position: absolute;
		top: var(--space-sm);
		right: var(--space-sm);
	}

	.whitelist-layout {
		display: grid;
		grid-template-columns: var(--whitelist-aside-width) minmax(0, 1fr);
		gap: var(--space-lg);
		align-items: start;
	}
	.lead {
		color: var(--color-muted);
		font-size: var(--font-mono-sm);
	}
	form {
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		padding: var(--space-md);
	}
	textarea {
		width: 100%;
		border-color: var(--color-signal);
		font-family: var(--font-mono);
	}
	#logins-help {
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	h2 {
		font-size: var(--font-section);
	}
	ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-field);
		background: var(--color-surface);
		min-width: 0;
	}
	li > div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	li.recent {
		border-color: var(--color-ok);
	}
	strong {
		font: 600 var(--font-mono-sm) var(--font-mono);
	}
	li span {
		color: var(--color-muted);
		font-size: var(--font-tiny);
	}
	li.recent span {
		color: var(--color-ok);
	}
	li form {
		margin: 0 0 0 auto;
		padding: 0;
		border: 0;
		background: none;
	}
	.remove {
		color: var(--color-danger);
		border-radius: var(--radius-pill);
		padding: var(--space-sm);
	}
	.note {
		color: var(--color-muted);
		font-size: var(--font-small);
	}
	@media (max-width: 1023px) {
		.whitelist-layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 767px) {
		ul {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
