<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '#lib/paraglide/messages.js';
	let ready = $state(false);
	let dark = $state(false);
	onMount(() => {
		const system = matchMedia('(prefers-color-scheme: dark)');
		const follow = () => {
			dark = document.documentElement.dataset.theme
				? document.documentElement.dataset.theme === 'dark'
				: system.matches;
		};
		follow();
		ready = true;
		system.addEventListener('change', follow);
		return () => system.removeEventListener('change', follow);
	});
	function toggle() {
		dark = !dark;
		const theme = dark ? 'dark' : 'light';
		document.documentElement.dataset.theme = theme;
		document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
	}
</script>

<button
	class="theme-switch icon-button"
	type="button"
	hidden={!ready}
	aria-label={dark ? m.theme_light() : m.theme_dark()}
	onclick={toggle}
>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
		{#if dark}
			<circle cx="12" cy="12" r="4" /><path
				d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"
			/>
		{:else}
			<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />
		{/if}
	</svg>
</button>
