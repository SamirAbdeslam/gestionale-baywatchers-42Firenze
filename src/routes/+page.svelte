<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Logo from '#lib/components/Logo.svelte';
	import EventCard from '#lib/components/EventCard.svelte';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head
	><title>{m.app_name()}</title><meta
		name="description"
		content={m.landing_description()}
	/></svelte:head
>
<div class="landing">
	<section class="welcome">
		<h1 class="sr-only">{m.landing_title()}</h1>
		<Logo compact />
		<p class="description">{m.landing_description()}</p>
		{#if data.loginFailed}<p role="alert">{m.auth_login_failed()}</p>{/if}
		<div class="login">
			<a class="button" href={resolve('/auth/login')}>{m.auth_login()} →</a><span
				>{m.auth_school_account()}</span
			>
		</div>
		{#if data.devLogin}<p><a href={resolve('/auth/dev')}>{m.auth_dev_login()}</a></p>{/if}
	</section>
	<div class="preview" aria-hidden="true">
		<p class="mono">{m.landing_preview()}</p>
		<EventCard
			event={{
				kind: 'exam',
				title: m.landing_exam(),
				startTime: '11:00',
				endTime: '13:00',
				compensation: 200,
				maxSlots: 4,
				registeredCount: 2
			}}
			orientation="horizontal"
		/>
		<EventCard
			event={{
				kind: 'icebreaker',
				title: m.event_kind_icebreaker(),
				startTime: '14:00',
				endTime: '16:00',
				compensation: 150,
				maxSlots: 6,
				registeredCount: 3
			}}
			orientation="horizontal"
		/>
		<EventCard
			event={{
				kind: 'rush',
				title: m.landing_rush(),
				startTime: '16:00',
				endTime: '19:00',
				compensation: 300,
				maxSlots: 5,
				registeredCount: 5
			}}
			orientation="horizontal"
		/>
	</div>
</div>

<style>
	.landing {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, var(--landing-preview-width));
		align-items: center;
		gap: var(--space-xl);
		min-height: calc(100svh - var(--header-height) - var(--space-xl) * 2);
	}
	.welcome {
		--logo-compact-width: 100%;
		max-width: var(--landing-copy-width);
	}
	.description {
		font-size: var(--font-section);
		color: var(--color-muted);
		margin-block: var(--space-xl);
	}
	.login {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-block: var(--space-lg);
	}
	.login span {
		font-size: var(--font-mono-sm);
		color: var(--color-muted);
	}
	.preview {
		--ticket-stub-width: var(--ticket-stub-preview);
	}
	.preview > p {
		color: var(--color-signal-text);
		font-size: var(--font-small);
	}
	@media (max-width: 767px) {
		.landing {
			grid-template-columns: minmax(0, 1fr);
			min-height: auto;
			gap: var(--space-lg);
		}
		.description {
			font-size: var(--font-size-body);
			margin-block: var(--space-lg);
		}
	}
</style>
