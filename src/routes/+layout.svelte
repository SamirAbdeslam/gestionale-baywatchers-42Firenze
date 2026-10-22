<script lang="ts">
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import Toast from '#lib/components/Toast.svelte';
	import { asset, resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	let nav = $state<HTMLElement>();
	// Invalidation clears page.form; keep action feedback until the next navigation.
	let messages = $state(page.form?.messages ?? []);
	$effect(() => {
		if (page.form) messages = page.form.messages ?? [];
	});
	onNavigate(() => {
		messages = [];
		nav?.hidePopover();
	});
</script>

<svelte:head><link rel="icon" href={asset('badge.png')} /></svelte:head>
{#if page.route.id !== '/display'}
	<a class="skip-link" href="#main">{m.app_skip_to_content()}</a>
	<header>
		<a class="brand" href={resolve('/')}
			><img src={asset('42_Logo.svg.png')} alt={m.app_school_name()} /><span>{m.app_name()}</span
			></a
		>
		{#if data.user}
			<button class="menu-toggle" type="button" popovertarget="main-navigation"
				>{m.nav_menu()}</button
			>
			<nav id="main-navigation" popover aria-label={m.nav_main()} bind:this={nav}>
				<a href={resolve('/calendar')}>{m.nav_calendar()}</a>
				{#if data.user.role === 'admin'}
					<a href={resolve('/admin')}>{m.nav_admin()}</a>
					<a href={resolve('/admin/templates')}>{m.nav_templates()}</a>
					<a href={resolve('/admin/participants')}>{m.nav_participants()}</a>
					<a href={resolve('/admin/whitelist')}>{m.nav_whitelist()}</a>
					<a href={resolve('/admin/logs')}>{m.nav_logs()}</a>
				{/if}
				<a href={resolve('/profile')}>{m.nav_profile()}</a>
				<form method="POST" action={resolve('/auth/logout')}>
					<button type="submit">{m.nav_logout()}</button>
				</form>
			</nav>
		{/if}
	</header>
{/if}
<main id="main" class:display={page.route.id === '/display'}>
	{#if page.route.id !== '/display'}<Toast {messages} />{/if}{@render children()}
</main>

<style>
	main.display {
		max-width: none;
	}
</style>
