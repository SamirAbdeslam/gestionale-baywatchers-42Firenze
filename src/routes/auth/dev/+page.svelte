<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{m.auth_dev_login()} — {m.app_name()}</title></svelte:head>
<h1>{m.auth_dev_login()}</h1>
{#if form?.message}<p role="alert">{form.message}</p>{/if}
<form method="POST">
	<input type="hidden" name="mode" value="existing" />
	<label for="userId">{m.auth_choose_user()}</label>
	<select id="userId" name="userId" required>
		{#each data.users as user (user.id)}<option value={user.id}
				>{user.login} ({user.role === 'admin' ? m.auth_role_admin() : m.auth_role_user()})</option
			>{/each}
	</select>
	<button type="submit">{m.auth_enter()}</button>
</form>
<h2>{m.auth_create_user()}</h2>
<form method="POST">
	<input type="hidden" name="mode" value="create" />
	<label for="login">{m.auth_login_label()}</label><input
		id="login"
		name="login"
		required
		maxlength="32"
		pattern="[a-zA-Z0-9_-]+"
	/>
	<label><input type="checkbox" name="admin" /> {m.auth_admin_label()}</label>
	<button type="submit">{m.auth_create_and_enter()}</button>
</form>
