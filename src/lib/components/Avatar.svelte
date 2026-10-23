<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	let {
		login,
		name,
		hasImage,
		size = 'profile'
	}: {
		login: string;
		name: string;
		hasImage: boolean;
		size?: 'header' | 'profile';
	} = $props();
	let image = $state<HTMLImageElement>();
	let failedLogin = $state<string>();
	onMount(() => {
		const img = image;
		if (!img) return;
		const onError = () => (failedLogin = login);
		img.addEventListener('error', onError);
		// An image can fail before Svelte attaches the error handler during hydration.
		if (img.complete && img.naturalWidth === 0) onError();
		return () => img.removeEventListener('error', onError);
	});
</script>

<span class="avatar" class:header={size === 'header'}>
	{#if hasImage && failedLogin !== login}
		<img
			bind:this={image}
			src={resolve('/avatar/[login]', { login })}
			alt={m.profile_image({ name })}
		/>
	{:else}
		<span aria-hidden="true"
			>{(name || login)
				.trim()
				.split(/\s+/)
				.slice(0, 2)
				.map((part) => part[0])
				.join('')
				.toUpperCase()}</span
		>
	{/if}
</span>

<style>
	.avatar {
		display: inline-grid;
		place-items: center;
		flex: none;
		width: var(--profile-image-size);
		height: var(--profile-image-size);
		border: var(--border-strong) solid var(--color-signal);
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--color-raised);
		font: 600 var(--font-mono-lg) var(--font-mono);
	}
	.header {
		width: var(--avatar-size);
		height: var(--avatar-size);
		font-size: var(--font-label);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
