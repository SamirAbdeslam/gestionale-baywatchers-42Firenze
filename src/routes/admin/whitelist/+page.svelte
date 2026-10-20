<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.nav_whitelist()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_whitelist()}</h1>
<form method="POST" action="?/add" use:enhance>
	<label for="logins">{m.whitelist_logins()}</label>
	<p id="logins-help">{m.whitelist_help()}</p>
	<textarea id="logins" name="logins" aria-describedby="logins-help" required rows="4"></textarea>
	<button type="submit">{m.whitelist_add()}</button>
</form>
{#if data.whitelist.length === 0}
	<p>{m.whitelist_empty()}</p>
{:else}
	<ul aria-label={m.nav_whitelist()}>
		{#each data.whitelist as row (row.id)}
			<li>
				<strong>{row.login}</strong>
				<span
					>{m.whitelist_added_at()}:
					<time datetime={row.addedAt.toISOString()}
						>{new Intl.DateTimeFormat(getLocale(), {
							dateStyle: 'medium',
							timeStyle: 'short',
							timeZone: 'Europe/Rome'
						}).format(row.addedAt)}</time
					></span
				>
				<form method="POST" action="?/remove" use:enhance>
					<input type="hidden" name="id" value={row.id} />
					<button type="submit">{m.whitelist_remove()}</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}

<style>
	textarea {
		max-width: 100%;
		width: 100%;
		padding: var(--space-sm);
		font: inherit;
		border: var(--border-width) solid var(--color-text);
		border-radius: var(--radius);
		background: var(--color-background);
		color: var(--color-text);
	}
</style>
