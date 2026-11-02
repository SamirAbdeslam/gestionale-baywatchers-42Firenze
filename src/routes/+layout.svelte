<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, goto, onNavigate } from '$app/navigation';
	import Dialog from '#lib/components/Dialog.svelte';
	import { onMount } from 'svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import ThemeSwitch from '#lib/components/ThemeSwitch.svelte';
	import Toast from '#lib/components/Toast.svelte';
	import { asset, resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales } from '#lib/paraglide/runtime.js';
	import '#lib/styles/base.css';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();
	let poolEnded = $state(0);
	onMount(() => {
		const closed = () => {
			if (data.user?.role !== 'user' || page.route.id === '/display') return;
			poolEnded += 1;
			if (page.route.id !== '/calendar') void goto(resolve('/calendar'));
		};
		window.addEventListener('pool_closed', closed);
		return () => window.removeEventListener('pool_closed', closed);
	});
	let userMenu = $state<HTMLElement>();
	// Each language is named in itself, so the same labels serve every locale.
	const languageNames = { it: 'Italiano', en: 'English', fr: 'Français' } as const;
	// Invalidation clears page.form; keep action feedback until the next navigation.
	let messages = $state(page.form?.messages ?? []);
	$effect(() => {
		if (page.form) messages = page.form.messages ?? [];
	});
	onNavigate((navigation) => {
		messages = [];
		userMenu?.hidePopover();
		// Cross-fade only real page changes; query changes (week, filters) swap in place.
		if (
			!document.startViewTransition ||
			navigation.from?.url.pathname === navigation.to?.url.pathname ||
			matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		return new Promise((resolve) => {
			// The browser may skip a transition (e.g. on resize); the navigation goes on anyway.
			document
				.startViewTransition(async () => {
					resolve();
					await navigation.complete;
				})
				.ready.catch(() => {});
		});
	});
	// On mobile the page title moves into the header once the large heading scrolls away.
	let header = $state<HTMLElement>();
	let headerTitle = $state('');
	let compact = $state(false);
	let titleObserver: IntersectionObserver | undefined;
	afterNavigate(() => {
		titleObserver?.disconnect();
		compact = false;
		const heading = document.querySelector('main h1');
		headerTitle = heading?.textContent?.trim() ?? '';
		if (!heading || !header) return;
		titleObserver = new IntersectionObserver(
			([entry]) => (compact = !entry.isIntersecting && entry.boundingClientRect.top < 0),
			{ rootMargin: `-${header.offsetHeight}px 0px 0px 0px` }
		);
		titleObserver.observe(heading);
	});
	onMount(() => () => titleObserver?.disconnect());
</script>

{#if poolEnded && data.user?.role === 'user'}
	{#key poolEnded}
		<Dialog label={m.pool_closed()} title={m.pool_closed()} closeLabel={m.dialog_ok()} open
			><p>{m.pool_closed()}</p></Dialog
		>
	{/key}
{/if}
<svelte:head><link rel="icon" href={asset('badge.png')} /></svelte:head>
{#if page.route.id !== '/display'}
	<a class="skip-link" href="#main">{m.app_skip_to_content()}</a>
	<header class="site-header" class:access={page.route.id === '/'} class:compact bind:this={header}>
		<div class="header-start">
			<!-- On mobile the logo is the way back to the calendar. -->
			<a class="brand" href={data.user ? resolve('/calendar') : resolve('/')}><Logo /></a>
			<span class="header-title" aria-hidden="true">{headerTitle}</span>
		</div>

		{#if data.user}
			<nav id="main-navigation" class="main-navigation" aria-label={m.nav_main()}>
				<a
					href={resolve('/calendar')}
					aria-current={page.route.id === '/calendar' ? 'page' : undefined}>{m.nav_calendar()}</a
				>
				{#if data.user.role === 'admin'}
					<a
						href={resolve('/admin')}
						aria-current={page.route.id?.startsWith('/admin') ? 'page' : undefined}
						>{m.nav_admin()}</a
					>
				{/if}
			</nav>
		{/if}
		<button class="language" type="button" popovertarget="language-menu">
			<span class="sr-only">{m.nav_language()}</span>
			{getLocale().toUpperCase()}
		</button>
		<nav id="language-menu" class="language-menu" popover aria-label={m.nav_language()}>
			{#each locales as locale (locale)}
				<a
					href="{resolve('/language/[locale]', { locale })}?to={encodeURIComponent(
						page.url.pathname + page.url.search
					)}"
					data-sveltekit-reload
					lang={locale}
					hreflang={locale}
					aria-current={locale === getLocale() ? 'true' : undefined}>{languageNames[locale]}</a
				>
			{/each}
		</nav>
		<ThemeSwitch />
		{#if data.user}
			<button class="identity" type="button" popovertarget="user-menu">
				<span class="sr-only">{m.nav_user_menu({ login: data.user.login })}</span>
				<Avatar
					login={data.user.login}
					name={data.user.displayName || data.user.login}
					hasImage={data.user.hasImage}
					size="header"
				/>
				<span class="user-login">@{data.user.login}</span>
			</button>
			<nav id="user-menu" class="user-menu" popover bind:this={userMenu} aria-label={m.nav_user()}>
				<a
					href={resolve('/profile')}
					aria-current={page.route.id === '/profile' ? 'page' : undefined}>{m.nav_profile()}</a
				>
				{#if data.user.role === 'admin'}
					<a
						href={resolve('/admin')}
						aria-current={page.route.id?.startsWith('/admin') ? 'page' : undefined}
						>{m.nav_admin()}</a
					>
				{/if}
				<form class="logout" method="POST" action={resolve('/auth/logout')}>
					<button type="submit">{m.nav_logout()}</button>
				</form>
			</nav>
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
	.header-start {
		display: grid;
		align-items: center;
		min-width: 0;
		margin-inline-end: auto;
	}
	.header-start > * {
		grid-area: 1 / 1;
	}
	.header-title {
		display: none;
		overflow: hidden;
		font: 800 var(--font-nav) var(--font-heading);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.identity,
	.language {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		font: 600 var(--font-label) var(--font-mono);
		background: transparent;
		color: var(--color-text);
		border: 0;
		padding: 0;
		min-height: var(--control-height-sm);
	}
	.user-menu,
	.language-menu {
		position: fixed;
		inset: calc(var(--brand-bar) + var(--header-height) + var(--space-sm)) var(--space-xl) auto auto;
		margin: 0;
		width: var(--user-menu-width);
		padding: var(--space-sm);
		color: var(--color-text);
		background: var(--color-surface);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-field);
		box-shadow: var(--menu-shadow);
	}
	.user-menu a,
	.language-menu a,
	.logout button {
		min-height: var(--control-height-sm);
		width: 100%;
		padding: var(--space-sm);
		border: 0;
		border-radius: var(--radius-sm);
		color: var(--color-text);
		font: 600 var(--font-nav) var(--font-body);
		justify-content: start;
	}
	.logout {
		margin: var(--space-xs) 0 0;
		padding-top: var(--space-xs);
		border-top: var(--border-width) solid var(--color-border);
	}
	.logout button {
		background: transparent;
		color: var(--color-danger);
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
		.identity .user-login {
			display: none;
		}
		.site-header {
			padding-inline: var(--space-md);
			gap: var(--space-sm);
		}
	}
	@media (max-width: 767px) {
		.user-menu,
		.language-menu {
			top: calc(var(--brand-bar) + var(--header-mobile-height) + var(--space-sm));
			right: var(--space-md);
		}
		.site-header {
			position: sticky;
			top: 0;
			z-index: var(--layer-nav);
			background: var(--color-background);
		}
		.main-navigation {
			display: none;
		}
		.header-title {
			display: block;
			visibility: hidden;
			opacity: 0;
			transform: translateY(var(--space-sm));
		}
		.compact .header-title {
			visibility: visible;
			opacity: 1;
			transform: none;
		}
		.compact .brand {
			visibility: hidden;
			opacity: 0;
			transform: translateY(calc(-1 * var(--space-sm)));
		}
		.admin-navigation {
			padding-inline: var(--space-md);
			gap: var(--space-md);
		}
	}
	@media (prefers-reduced-motion: no-preference) {
		.brand,
		.header-title {
			transition:
				opacity var(--duration-fast) ease,
				transform var(--duration-spring) var(--ease-spring),
				visibility var(--duration-fast);
		}
		.user-menu,
		.language-menu {
			transform-origin: top right;
			transition:
				opacity var(--duration-fast) ease,
				transform var(--duration-spring) var(--ease-spring),
				display var(--duration-fast) allow-discrete,
				overlay var(--duration-fast) allow-discrete;
		}
		.user-menu:not(:popover-open),
		.language-menu:not(:popover-open) {
			opacity: 0;
			transform: scale(0.94);
		}
		@starting-style {
			.user-menu:popover-open,
			.language-menu:popover-open {
				opacity: 0;
				transform: scale(0.94);
			}
		}
	}
</style>
