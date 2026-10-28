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
<div class="page-head">
	<div>
		<h1>{m.nav_logs()}</h1>
		<p class="count">
			{m.logs_count({ shown: formatNumber(data.rows.length), total: formatNumber(data.total) })}
		</p>
	</div>
	<a class="button secondary" href="{resolve('/admin/logs.csv')}{query()}" download
		>{m.logs_export()}</a
	>
</div>
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
</form>
{#if pending}<div role="status">
		<button type="button" onclick={refresh}>{m.logs_new_available()}</button>
	</div>{/if}
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
	form {
		display: flex;
		flex-direction: row;
		align-items: end;
		flex-wrap: wrap;
		gap: var(--space-md);
		padding: var(--space-md);
		border: var(--border-width) solid var(--color-border);
		background: var(--color-surface);
		border-radius: var(--radius-panel);
	}
	.page-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-bottom: var(--space-md);
	}
	.page-head h1 {
		margin: 0;
	}
	.count {
		margin: 0;
		color: var(--color-muted);
		font: var(--font-mono-sm) var(--font-mono);
	}
	[role='status'] button {
		width: 100%;
		background: transparent;
		color: var(--color-signal-text);
		border: var(--border-width) solid var(--color-signal);
		border-radius: var(--radius-field);
		margin-block: var(--space-md) 0;
	}
	.table-wrap {
		margin-top: var(--space-md);
	}
	td {
		font-size: var(--font-small);
	}
	td:first-child,
	td:last-child {
		white-space: nowrap;
	}
	td:last-child > :global(button) {
		min-height: var(--control-height-sm);
		padding-inline: var(--space-md);
		background: transparent;
		color: var(--color-text);
		border: var(--border-width) solid var(--color-border);
		white-space: nowrap;
	}
	td:first-child,
	td:nth-child(2),
	td:nth-child(5) {
		font-family: var(--font-mono);
	}
	td > span {
		display: inline-flex;
		font: 600 var(--font-tiny) var(--font-mono);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-sm);
	}
	pre {
		background: var(--color-background);
		padding: var(--space-md);
		border-radius: var(--radius-sm);
	}

	.new {
		background: var(--color-log-new);
	}
	.create {
		background: var(--color-log-create-bg);
		color: var(--color-log-create);
	}
	.update {
		background: var(--color-log-update-bg);
		color: var(--color-log-update);
	}
	.delete {
		background: var(--color-log-delete-bg);
		color: var(--color-log-delete);
	}
	.register {
		background: var(--color-log-register-bg);
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
