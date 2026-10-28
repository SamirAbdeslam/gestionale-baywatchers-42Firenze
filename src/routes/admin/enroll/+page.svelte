<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listenRealtime } from '#lib/realtime.ts';
	import EnrollmentQr from '#lib/components/EnrollmentQr.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
	onMount(() =>
		listenRealtime(
			(event) => {
				if (event.type === 'log_created') void invalidate('app:enrollment');
			},
			() => void invalidate('app:enrollment')
		)
	);
</script>

<svelte:head><title>{m.enrollment_qr()} — {m.app_name()}</title></svelte:head>
<a class="close" href={resolve('/admin/whitelist')} aria-label={m.enrollment_close_qr()}>×</a>
<EnrollmentQr enrollment={data.enrollment} />

<style>
	.close {
		float: right;
		font-size: var(--font-section);
		padding: var(--space-sm);
	}
</style>
