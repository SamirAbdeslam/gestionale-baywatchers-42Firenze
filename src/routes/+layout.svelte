<script lang="ts">
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';
	import Logo from '#lib/components/Logo.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import ThemeSwitch from '#lib/components/ThemeSwitch.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { asset, resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	// Invalidation clears page.form; keep action feedback until the next navigation.
	let messages = $state(page.form?.messages ?? []);
	$effect(() => {
		if (page.form) messages = page.form.messages ?? [];
	});
	onNavigate(() => {
		messages = [];
	});
</script>

<svelte:head><link rel="icon" href={asset('badge.png')} /></svelte:head>
{#if page.route.id !== '/display'}
	<a class="skip-link" href="#main">{m.app_skip_to_content()}</a>
	<header class="site-header" class:access={page.route.id === '/'}>
		<a class="brand" href={resolve('/')}><Logo /></a>

		{#if data.user}
			<nav id="main-navigation" class="main-navigation" aria-label={m.nav_main()}>
				<a
					href={resolve('/calendar')}
					aria-current={page.route.id === '/calendar' ? 'page' : undefined}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
						><rect x="3" y="5" width="18" height="16" rx="2" /><path
							d="M3 10h18M8 3v4m8-4v4"
						/></svg
					>
					{m.nav_calendar()}
				</a>
				<a
					href={resolve('/profile')}
					aria-current={page.route.id === '/profile' ? 'page' : undefined}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
						><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></svg
					>
					{m.nav_profile()}
				</a>
				{#if data.user.role === 'admin'}
					<a
						href={resolve('/admin')}
						aria-current={page.route.id?.startsWith('/admin') ? 'page' : undefined}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
							><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle
								cx="16"
								cy="17"
								r="3"
							/></svg
						>
						{m.nav_admin()}
					</a>
				{/if}
			</nav>
		{/if}
		<ThemeSwitch />
		{#if data.user}
			<div class="identity">
				<Avatar
					login={data.user.login}
					name={data.user.displayName || data.user.login}
					hasImage={data.user.hasImage}
					size="header"
				/>
				<span>@{data.user.login}</span>
			</div>
			<form class="logout" method="POST" action={resolve('/auth/logout')}>
				<button class="secondary" type="submit">{m.nav_logout()}</button>
			</form>
		{/if}
	</header>
{/if}
{#if data.user?.role === 'admin' && page.route.id?.startsWith('/admin')}
	<nav class="admin-navigation" aria-label={m.nav_admin()}>
		{#each [{ route: '/admin', href: resolve('/admin'), label: m.nav_weeks() }, { route: '/admin/templates', href: resolve('/admin/templates'), label: m.nav_templates() }, { route: '/admin/participants', href: resolve('/admin/participants'), label: m.nav_participants() }, { route: '/admin/whitelist', href: resolve('/admin/whitelist'), label: m.nav_whitelist() }, { route: '/admin/logs', href: resolve('/admin/logs'), label: m.nav_logs() }] as item (item.route)}
			<!-- Compare route ids: during SSR resolve() returns relative hrefs. -->
			<a
				href={item.href}
				aria-current={page.route.id === item.route ||
				(item.route !== '/admin' && page.route.id?.startsWith(item.route + '/'))
					? 'page'
					: undefined}>{item.label}</a
			>
		{/each}
		{#if page.data.displayUrl}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Absolute URL includes the configured display token. -->
			<a class="display-link" href={page.data.displayUrl} target="_blank" rel="noopener noreferrer"
				>{m.admin_open_display()} ↗</a
			>
		{/if}
	</nav>
{/if}

<main
	class:admin-page={page.route.id?.startsWith('/admin')}
	id="main"
	class:authenticated={!!data.user}
	class:display={page.route.id === '/display'}
	class:calendar={page.route.id === '/calendar' || page.route.id === '/admin'}
>
	{#if page.route.id !== '/display'}<Toast {messages} />{/if}{@render children()}
</main>

<style>
	.site-header.access {
		border-bottom: 0;
	}
	.site-header.access .brand {
		visibility: hidden;
	}
	main.display,
	main.calendar {
		max-width: none;
	}
	.main-navigation,
	.admin-navigation {
		display: flex;
		align-items: stretch;
		gap: var(--space-lg);
	}
	.main-navigation {
		align-self: stretch;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		color: var(--color-muted);
		text-decoration: none;
		font-size: var(--font-nav);
		font-weight: 600;
		border-block-end: var(--nav-underline) solid transparent;
	}
	nav a[aria-current] {
		color: var(--color-text);
		border-color: var(--color-signal);
	}
	.main-navigation svg {
		display: none;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font: 600 var(--font-label) var(--font-mono);
		border-inline-start: var(--border-width) solid var(--color-border);
		padding-inline-start: var(--space-md);
	}
	.logout {
		margin: 0;
	}
	.logout button {
		min-height: var(--control-height-sm);
		font-size: var(--font-small);
	}
	.admin-navigation {
		min-height: var(--header-mobile-height);
		padding-inline: var(--space-xl);
		border-bottom: var(--border-width) solid var(--color-border);
		overflow-x: auto;
	}
	.display-link {
		margin-inline-start: auto;
	}
	.admin-navigation a {
		flex-shrink: 0;
	}
	@media (max-width: 1199px) {
		.identity > span:last-child {
			display: none;
		}
		.site-header {
			padding-inline: var(--space-md);
			gap: var(--space-sm);
		}
	}
	@media (max-width: 767px) {
		.identity {
			display: none;
		}
		.main-navigation {
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			height: var(--bottom-nav-height);
			padding-bottom: env(safe-area-inset-bottom);
			gap: 0;
			background: var(--color-background);
			border-block-start: var(--border-width) solid var(--color-border);
			z-index: var(--layer-nav);
		}
		.main-navigation a {
			flex: 1;
			flex-direction: column;
			justify-content: center;
			gap: var(--space-xs);
			font-size: var(--font-small);
			border-block-start: var(--nav-underline) solid transparent;
			border-block-end: 0;
		}
		.main-navigation a[aria-current] {
			color: var(--color-signal-text);
			border-block-start-color: var(--color-signal);
		}
		.main-navigation svg {
			display: block;
			height: var(--icon-size);
			width: var(--icon-size);
			stroke-width: var(--border-strong);
		}
		.admin-navigation {
			padding-inline: var(--space-md);
			gap: var(--space-md);
		}
		main.authenticated {
			padding-bottom: calc(var(--bottom-nav-height) + var(--space-lg));
		}
	}
</style>
