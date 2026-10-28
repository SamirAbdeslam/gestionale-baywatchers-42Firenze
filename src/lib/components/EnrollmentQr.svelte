<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { poolName, formatNumber } from '#lib/format.ts';
	let {
		enrollment
	}: {
		enrollment: {
			poolStart: string | null;
			url: string | null;
			qr: string | null;
			received: number;
		};
	} = $props();
</script>

<div class="projection">
	{#if enrollment.qr && enrollment.url && enrollment.poolStart}
		<h1>{poolName(enrollment.poolStart)}</h1>
		<img class="qr" src={enrollment.qr} alt={m.enrollment_qr()} />
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Absolute same-origin URL built on the server. -->
		<a class="join-url" href={enrollment.url}>{enrollment.url}</a>
		<p role="status" aria-live="polite">
			{m.enrollment_received({ count: formatNumber(enrollment.received) })}
		</p>
	{:else}<h1>{m.enrollment_closed()}</h1>{/if}
</div>

<style>
	.projection {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-md);
		min-height: 75dvh;
		text-align: center;
	}
	.qr {
		width: min(65dvh, 80vw, 640px);
		height: auto;
		max-width: 100%;
		background: white;
	}
	.join-url {
		overflow-wrap: anywhere;
		max-width: 100%;
	}
	p {
		font-size: var(--font-section);
	}
</style>
