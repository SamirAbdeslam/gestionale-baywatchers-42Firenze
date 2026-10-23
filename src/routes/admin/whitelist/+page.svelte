<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
	const recent = $derived(
		form?.messages?.flatMap((message) =>
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
