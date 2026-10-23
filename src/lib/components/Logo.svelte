<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="logo" class:compact role="img" aria-label={m.app_name()}></span>

<style>
	.logo {
		display: inline-block;
		flex-shrink: 0;
		width: calc(var(--logo-size) * var(--logo-aspect));
		height: var(--logo-size);
		max-width: 100%;
		background: var(--color-text);
		mask: url('../assets/logo-horizontal.svg') center / contain no-repeat;
	}
	.compact {
		width: var(--logo-compact-width);
		height: auto;
		aspect-ratio: var(--logo-stacked-aspect);
		mask-image: url('../assets/logo-stacked.svg');
	}
</style>
