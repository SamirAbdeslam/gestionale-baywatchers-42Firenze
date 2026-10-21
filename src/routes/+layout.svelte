<script lang="ts">
	import { page } from '$app/state';
	import Toast from '#lib/components/Toast.svelte';
	import { asset, resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	let menuOpen = $state(false);
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
			<button
				class="menu-toggle"
				type="button"
				aria-expanded={menuOpen}
				aria-controls="main-navigation"
				onclick={() => (menuOpen = !menuOpen)}>{m.nav_menu()}</button
			>
			<nav id="main-navigation" aria-label={m.nav_main()} class:open={menuOpen}>
				<a href={resolve('/calendar')} onclick={() => (menuOpen = false)}>{m.nav_calendar()}</a>
				{#if data.user.role === 'admin'}
					<a href={resolve('/admin')} onclick={() => (menuOpen = false)}>{m.nav_admin()}</a>
					<a href={resolve('/admin/templates')} onclick={() => (menuOpen = false)}
						>{m.nav_templates()}</a
					>
					<a href={resolve('/admin/participants')} onclick={() => (menuOpen = false)}
						>{m.nav_participants()}</a
					>
					<a href={resolve('/admin/whitelist')} onclick={() => (menuOpen = false)}
						>{m.nav_whitelist()}</a
					>
					<a href={resolve('/admin/logs')} onclick={() => (menuOpen = false)}>{m.nav_logs()}</a>
				{/if}
				<a href={resolve('/profile')} onclick={() => (menuOpen = false)}>{m.nav_profile()}</a>
				<form method="POST" action={resolve('/auth/logout')}>
					<button type="submit">{m.nav_logout()}</button>
				</form>
			</nav>
		{/if}
	</header>
{/if}
<main id="main" class:display={page.route.id === '/display'}>
	{#if page.route.id !== '/display'}<Toast
			messages={page.form?.messages ?? []}
		/>{/if}{@render children()}
</main>

<style>
	main.display {
		max-width: none;
	}
</style>
