<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import Recap from '#lib/components/Recap.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	onMount(() => {
		const reload = () => {
			void invalidate('app:recap');
		};
		return listenRealtime((event) => {
			if (event.type !== 'log_created') reload();
		}, reload);
	});
</script>

<svelte:head><title>{m.recap_title()} — {m.app_name()}</title></svelte:head>
<h1>{m.recap_title()}</h1>
<Recap recap={data.recap} />
