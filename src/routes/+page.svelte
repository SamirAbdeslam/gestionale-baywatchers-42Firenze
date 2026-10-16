<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>{m.app_name()}</title>
	<meta name="description" content={m.landing_description()} />
</svelte:head>

<h1>{m.landing_title()}</h1>
<p>{m.landing_description()}</p>
