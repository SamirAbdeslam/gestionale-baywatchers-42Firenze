<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/badge.png" />
</svelte:head>

<a class="skip-link" href="#main">{m.app_skip_to_content()}</a>
<header>
	<img src="/42_Logo.svg.png" alt={m.app_school_name()} />
	<span>{m.app_name()}</span>
</header>
<main id="main">
	{@render children()}
</main>
