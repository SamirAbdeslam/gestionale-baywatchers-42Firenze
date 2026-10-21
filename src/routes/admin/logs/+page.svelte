<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { listenRealtime } from '#lib/realtime.ts';
	import { m } from '#lib/paraglide/messages.js';
	onMount(() =>
		listenRealtime((event) => {
			if (event.type === 'log_created') void invalidate('app:logs');
		})
	);
</script>

<svelte:head><title>{m.nav_logs()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_logs()}</h1>
<p>{m.placeholder_description()}</p>
