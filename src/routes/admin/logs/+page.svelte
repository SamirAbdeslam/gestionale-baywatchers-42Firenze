<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet, SvelteURLSearchParams } from 'svelte/reactivity';
	import { invalidate, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { listenRealtime } from '#lib/realtime.ts';
	import Dialog from '#lib/components/Dialog.svelte';
	import { formatNumber } from '#lib/format.ts';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	let pending = $state(false);
	const highlighted = new SvelteSet<number>();
	const reload = () => invalidate('app:logs');
	const receive = (id?: number) => {
		if (data.page === 1 && !Object.values(data.filters).some(Boolean)) {
			if (id !== undefined) highlighted.add(id);
			void reload();
		} else pending = true;
	};
	onMount(() =>
		listenRealtime(
			(event) => {
				if (event.type === 'log_created') receive(event.id);
			},
			() => receive()
		)
	);
	onNavigate(() => {
		pending = false;
		highlighted.clear();
	});
	function query(page?: number) {
		const params = new SvelteURLSearchParams(
			Object.entries(data.filters).filter(([, value]) => value)
		);
		if (page !== undefined) params.set('page', String(page));
		return `?${params}`;
	}
	async function refresh() {
		await reload();
		pending = false;
		highlighted.clear();
	}
</script>

<svelte:head><title>{m.nav_logs()} — {m.app_name()}</title></svelte:head>
<h1>{m.nav_logs()}</h1>
<form method="GET" action={resolve('/admin/logs')}>
	<label>{m.logs_date()}<input type="date" name="date" value={data.filters.date} /></label>
	<label for="logs-user">{m.logs_user()}</label>
	<select id="logs-user" name="user" value={data.filters.user}>
		<option value="">{m.logs_all_users()}</option>
		{#each data.users as user (user)}<option value={user}>{user}</option>{/each}
	</select>
	<label for="logs-action">{m.logs_action()}</label>
	<select id="logs-action" name="action" value={data.filters.action}>
		<option value="">{m.logs_all_actions()}</option>
		{#each data.actions as action (action)}<option value={action}>{action}</option>{/each}
	</select>
	<button type="submit">{m.logs_filter()}</button>
	<a href={resolve('/admin/logs')}>{m.logs_reset()}</a>
	<a href="{resolve('/admin/logs.csv')}{query()}" download>{m.logs_export()}</a>
</form>
{#if pending}<div role="status">
		<button type="button" onclick={refresh}>{m.logs_new_available()}</button>
	</div>{/if}
<p>{m.logs_count({ shown: formatNumber(data.rows.length), total: formatNumber(data.total) })}</p>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard access to the horizontally scrollable table.) -->
<div class="table-wrap" role="region" aria-label={m.nav_logs()} tabindex="0">
	<table>
		<thead
			><tr
				><th scope="col">{m.logs_timestamp()}</th><th scope="col">{m.logs_user()}</th><th
					scope="col">{m.logs_action()}</th
				><th scope="col">{m.logs_description()}</th><th scope="col">{m.logs_ip()}</th><th
					scope="col">{m.logs_details()}</th
				></tr
			></thead
		>
		<tbody>
			{#each data.rows as log (log.id)}
				<tr class:new={highlighted.has(log.id)}>
					<td>{log.timestamp}</td><td>{log.actorLogin}</td><td
						><span class={log.category}>{log.actionType}</span></td
					><td>{log.description}</td><td>{log.ipAddress ?? ''}</td>
					<td
						><Dialog
							label={m.logs_details()}
							title={m.logs_detail_title({ id: formatNumber(log.id) })}
						>
							<dl>
								<dt>{m.logs_id()}</dt>
								<dd>{formatNumber(log.id)}</dd>
								<dt>{m.logs_timestamp()}</dt>
								<dd>{log.timestamp}</dd>
								<dt>{m.logs_user_id()}</dt>
								<dd>{log.actorUserId ?? ''}</dd>
								<dt>{m.logs_user()}</dt>
								<dd>{log.actorLogin}</dd>
								<dt>{m.logs_action()}</dt>
								<dd>{log.actionType}</dd>
								<dt>{m.logs_description()}</dt>
								<dd>{log.description}</dd>
								<dt>{m.logs_ip()}</dt>
								<dd>{log.ipAddress ?? ''}</dd>
								<dt>{m.logs_user_agent()}</dt>
								<dd>{log.userAgent ?? ''}</dd>
								<dt>{m.logs_resource_type()}</dt>
								<dd>{log.resourceType ?? ''}</dd>
								<dt>{m.logs_resource_id()}</dt>
								<dd>{log.resourceId ?? ''}</dd>
								<dt>{m.logs_old_value()}</dt>
								<dd><pre>{JSON.stringify(log.oldValue, null, 2)}</pre></dd>
								<dt>{m.logs_new_value()}</dt>
								<dd><pre>{JSON.stringify(log.newValue, null, 2)}</pre></dd>
							</dl>
						</Dialog></td
					>
				</tr>
			{:else}<tr><td colspan="6">{m.logs_empty()}</td></tr>{/each}
		</tbody>
	</table>
</div>
<nav aria-label={m.logs_pagination()}>
	{#if data.page > 1}<a href="{resolve('/admin/logs')}{query(data.page - 1)}">{m.logs_previous()}</a
		>{/if}
	<span aria-current="page"
		>{m.logs_page({ page: formatNumber(data.page), total: formatNumber(data.totalPages) })}</span
	>
	{#if data.page < data.totalPages}<a href="{resolve('/admin/logs')}{query(data.page + 1)}"
			>{m.logs_next()}</a
		>{/if}
</nav>

<style>
	.table-wrap {
		max-width: 100%;
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th,
	td {
		padding: var(--space-sm);
		text-align: start;
		vertical-align: top;
		border-block-end: var(--border-width) solid var(--color-text);
	}
	.new {
		background: var(--color-log-new);
	}
	.create {
		color: var(--color-log-create);
	}
	.update {
		color: var(--color-log-update);
	}
	.delete {
		color: var(--color-log-delete);
	}
	.register {
		color: var(--color-log-register);
	}
	.other {
		color: var(--color-text);
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-block: var(--space-md);
	}
	dd {
		margin-inline-start: 0;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
