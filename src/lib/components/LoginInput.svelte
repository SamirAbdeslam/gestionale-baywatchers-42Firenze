<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	type Suggestion = { login: string; name: string | null; hasImage: boolean };
	let { id, name, placeholder }: { id: string; name: string; placeholder: string } = $props();
	let value = $state('');
	let suggestions = $state<Suggestion[]>([]);
	let active = $state(-1);
	let open = $state(false);
	let failed = $state<string[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	const listId = $derived(`${id}-list`);

	function search() {
		clearTimeout(timer);
		controller?.abort();
		const q = value.trim().toLowerCase();
		if (!q) {
			suggestions = [];
			open = false;
			return;
		}
		timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const response = await fetch(`/admin/logins?q=${encodeURIComponent(q)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error('Suggestions unavailable');
				suggestions = await response.json();
				active = -1;
				open = suggestions.length > 0;
			} catch {
				// The plain field and the server check keep working without suggestions.
			}
		}, 150);
	}
	function choose(login: string) {
		value = login;
		open = false;
		active = -1;
	}
	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			open = false;
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (!suggestions.length) return;
			event.preventDefault();
			open = true;
			active =
				event.key === 'ArrowDown'
					? (active + 1) % suggestions.length
					: (active <= 0 ? suggestions.length : active) - 1;
		} else if (event.key === 'Enter' && open && active >= 0) {
			event.preventDefault();
			choose(suggestions[active].login);
		}
	}
	const initials = (item: Suggestion) =>
		(item.name || item.login)
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase();
</script>

<div class="login-input">
	<input
		{id}
		{name}
		{placeholder}
		{onkeydown}
		bind:value
		oninput={search}
		onblur={() => (open = false)}
		maxlength="32"
		required
		autocomplete="off"
		autocapitalize="none"
		spellcheck="false"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listId}
		aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
	/>
	<ul id={listId} role="listbox" aria-label={m.admin_participant_suggestions()} hidden={!open}>
		{#each suggestions as item, index (item.login)}
			<!-- svelte-ignore a11y_click_events_have_key_events (The input drives the keyboard interaction.) -->
			<li
				id={`${id}-option-${index}`}
				role="option"
				aria-selected={index === active}
				class:active={index === active}
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => choose(item.login)}
			>
				<span class="face" aria-hidden="true">
					{#if item.hasImage && !failed.includes(item.login)}
						<img
							src={resolve('/avatar/[login]', { login: item.login })}
							alt=""
							onerror={() => (failed = [...failed, item.login])}
						/>
					{:else}{initials(item)}{/if}
				</span>
				<strong>{item.login}</strong>
				{#if item.name}<span class="name">{item.name}</span>{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.login-input {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	ul {
		list-style: none;
		margin: var(--space-xs) 0 0;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-field);
		background: var(--color-surface);
		overflow: hidden;
	}
	ul[hidden] {
		display: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: var(--control-height-sm);
		padding: 0 var(--space-sm);
		font: 500 var(--font-small) var(--font-mono);
		cursor: pointer;
	}
	li.active,
	li:hover {
		background: var(--color-raised);
	}
	.face {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--color-raised);
		font-size: 0.625rem;
	}
	.face img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-text-muted, inherit);
	}
</style>
