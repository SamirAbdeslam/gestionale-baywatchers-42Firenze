<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.app_name()}</title>
	<meta name="description" content={m.landing_description()} />
</svelte:head>

<h1>{m.landing_title()}</h1>
<p>{m.landing_description()}</p>

{#if data.loginFailed}<p role="alert">{m.auth_login_failed()}</p>{/if}
<p><a href={resolve('/auth/login')}>{m.auth_login()}</a></p>
{#if data.devLogin}<p><a href={resolve('/auth/dev')}>{m.auth_dev_login()}</a></p>{/if}
