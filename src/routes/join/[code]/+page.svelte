<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { poolName } from '#lib/format.ts';
	import Dialog from '#lib/components/Dialog.svelte';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{m.enrollment_join()} — {m.app_name()}</title></svelte:head>
{#if data.enrollment.state === 'closed'}
	<h1>{m.enrollment_closed()}</h1>
{:else if !data.user}
	<h1>{m.enrollment_join()}</h1>
	<a href="{resolve('/auth/login')}?to={encodeURIComponent('/join/' + data.paramsCode)}"
		>{m.auth_login()}</a
	>
	{#if data.devLogin}<p>
			<a href="{resolve('/auth/dev')}?to={encodeURIComponent('/join/' + data.paramsCode)}"
				>{m.auth_dev_login()}</a
			>
		</p>{/if}
{:else if data.enrollment.state === 'approved'}
	<h1>{m.enrollment_already_in()}</h1>
{:else if data.enrollment.state === 'waiting'}
	<h1>{form?.ok ? m.enrollment_sent() : m.enrollment_waiting()}</h1>
{:else if data.enrollment.poolStart}
	<Dialog
		open
		label={m.enrollment_join()}
		title={m.enrollment_question({ pool: poolName(data.enrollment.poolStart) })}
	>
		<form method="POST">
			<fieldset>
				<legend>{m.enrollment_choose_weeks()}</legend>
				{#each [1, 2, 3, 4] as week (week)}
					<label
						><input type="checkbox" name="weeks" value={week} />
						{m.enrollment_week({ week })}</label
					>
				{/each}
			</fieldset>
			{#if form && !form.ok}<p role="alert">{m.error_invalid_input()}</p>{/if}
			<button type="submit">{m.enrollment_confirm()}</button>
		</form>
	</Dialog>
{/if}
