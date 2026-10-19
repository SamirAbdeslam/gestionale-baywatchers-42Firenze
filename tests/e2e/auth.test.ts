import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';
import postgres from 'postgres';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { adminRoutes } from './routes.ts';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
const client = postgres(databaseUrl, { onnotice: () => {} });
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function devLogin(request: APIRequestContext, admin = false) {
	const login = `e2e_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
	const response = await request.post('/auth/dev', {
		form: { mode: 'create', login, ...(admin ? { admin: 'on' } : {}) },
		headers: { origin, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	return login;
}
async function snapshot() {
	const result: unknown[] = [];
	// Concurrent tests may log in; only those authorized auth writes are excluded.
	for (const table of [
		'events',
		'registrations',
		'settings',
		'week_templates',
		'template_events',
		'whitelist'
	])
		result.push(
			await client`SELECT md5(coalesce(json_agg(t ORDER BY id)::text,'')) AS hash FROM ${client(table)} t`
		);
	result.push(
		await client`SELECT md5(coalesce(json_agg(t ORDER BY id)::text,'')) AS hash FROM action_logs t WHERE action_type <> 'LOGIN'`
	);
	return result;
}
test('the authorization matrix covers every admin route and named action', () => {
	const files = readdirSync('src/routes/admin', { recursive: true }).filter(
		(file): file is string =>
			typeof file === 'string' && /\+(?:page(?:\.server)?|server)\.(?:svelte|ts)$/.test(file)
	);
	const ids = [
		...new Set(
			files.map(
				(file) =>
					'/admin' + (dirname(file) === '.' ? '' : '/' + dirname(file).replaceAll('\\', '/'))
			)
		)
	].sort();
	expect(ids).toEqual(adminRoutes.map((route) => route.id).sort());
	for (const route of adminRoutes) {
		if (!route.actions.length) continue;
		const path = resolve('src/routes' + route.id, '+page.server.ts');
		const source = ts.createSourceFile(
			path,
			readFileSync(path, 'utf8'),
			ts.ScriptTarget.Latest,
			true
		);
		let actions: string[] = [];
		for (const statement of source.statements)
			if (ts.isVariableStatement(statement))
				for (const declaration of statement.declarationList.declarations) {
					if (
						declaration.name.getText(source) === 'actions' &&
						declaration.initializer &&
						ts.isObjectLiteralExpression(declaration.initializer)
					)
						actions = declaration.initializer.properties.map((property) =>
							property.name!.getText(source).replaceAll(/['"]/g, '')
						);
				}
		expect(actions.sort(), relative('.', path)).toEqual([...route.actions].sort());
	}
});
for (const actor of ['anonymous', 'user', 'admin'] as const)
	test(`authorization matrix: ${actor}`, async ({ request }) => {
		if (actor !== 'anonymous') await devLogin(request, actor === 'admin');
		const before = await snapshot();
		for (const route of adminRoutes) {
			const response = await request.get(route.url, { maxRedirects: 0 });
			expect(response.status(), route.url).toBe(
				actor === 'anonymous'
					? route.endpoint
						? 401
						: 303
					: actor === 'user'
						? 403
						: route.endpoint
							? 501
							: 200
			);
			for (const action of route.actions) {
				const response = await request.post(`${route.url}?/${action}`, {
					form: { id: '1', week: '1', login: 'dev_user' },
					headers: { origin },
					maxRedirects: 0
				});
				expect(response.status(), `${route.url}?/${action}`).toBe(
					actor === 'anonymous' ? 401 : actor === 'user' ? 403 : 501
				);
			}
		}
		expect(await snapshot()).toEqual(before);
	});
test('default-deny covers protected pages, endpoints and lookalike public paths', async ({
	request
}) => {
	for (const path of [
		'/calendar',
		'/profile',
		'/display-private',
		'/healthz-private',
		'/authentication',
		'/api/streams',
		'/unknown'
	])
		expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(303);
	expect((await request.get('/events/1/calendar.ics', { maxRedirects: 0 })).status()).toBe(401);
	expect(
		(
			await request.post('/calendar?/register', {
				form: { id: '1' },
				headers: { origin },
				maxRedirects: 0
			})
		).status()
	).toBe(401);
	expect(
		(await request.post('/auth/logout', { headers: { origin }, maxRedirects: 0 })).status()
	).toBe(401);
	expect((await request.get('/display')).status()).toBe(200);
	expect((await request.get('/badge.png')).status()).toBe(200);
});
test('dev login has accessible forms, responsive navigation and POST logout', async ({
	page,
	request
}) => {
	await page.goto('/auth/dev');
	await expect(page.getByLabel('Utente esistente')).toBeVisible();
	await page.getByLabel('Utente esistente').selectOption({ label: 'dev_admin (admin)' });
	await page.getByRole('button', { name: 'Entra', exact: true }).click();
	await expect(page).toHaveURL('/calendar');
	await page.setViewportSize({ width: 360, height: 800 });
	const menu = page.getByRole('button', { name: 'Menu', exact: true });
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	await menu.click();
	await expect(menu).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByRole('link', { name: 'Whitelist', exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.getByRole('link', { name: 'Profilo', exact: true }).click();
	await expect(page).toHaveURL('/profile');
	await expect(menu).toHaveAttribute('aria-expanded', 'false');
	const cookie = (await page.context().cookies()).find((c) => c.name === 'session');
	expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
	expect(cookie?.value).toMatch(/^[a-z2-7]{32}$/);
	expect((await page.request.get('/auth/logout', { maxRedirects: 0 })).status()).toBe(405);
	expect((await page.request.get('/calendar', { maxRedirects: 0 })).status()).toBe(200);
	await menu.click();
	await page.getByRole('button', { name: 'Logout', exact: true }).click();
	await expect(page).toHaveURL('/');
	expect((await page.context().cookies()).some((c) => c.name === 'session')).toBe(false);
	expect((await request.get('/profile', { maxRedirects: 0 })).status()).toBe(303);
});
test('normal users have no admin navigation and role revocation takes effect immediately', async ({
	page
}) => {
	const login = await devLogin(page.request, true);
	await page.goto('/calendar');
	await client`UPDATE users SET role='user' WHERE login=${login}`;
	expect((await page.request.get('/admin', { maxRedirects: 0 })).status()).toBe(403);
	await page.reload();
	await page.setViewportSize({ width: 360, height: 800 });
	await page.getByRole('button', { name: 'Menu', exact: true }).click();
	await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Profilo', exact: true })).toBeVisible();
});
test('rejects cross-origin form posts, invalid dev inputs and OAuth callbacks without matching state', async ({
	request
}) => {
	const before = (await client`SELECT count(*)::int AS n FROM users`)[0].n;
	expect(
		(
			await request.post('/auth/dev', {
				form: { mode: 'create', login: '<img>' },
				headers: { origin },
				maxRedirects: 0
			})
		).status()
	).toBe(400);
	expect(
		(
			await request.post('/auth/dev', {
				form: { mode: 'existing', userId: 'not-an-id' },
				headers: { origin },
				maxRedirects: 0
			})
		).status()
	).toBe(400);
	expect(
		(
			await request.post('/auth/dev', {
				form: { mode: 'create', login: 'csrf_user' },
				headers: { origin: 'https://evil.example' },
				maxRedirects: 0
			})
		).status()
	).toBe(403);
	// Other parallel tests may create users; this rejected identity must never exist.
	expect(await client`SELECT id FROM users WHERE login='csrf_user'`).toHaveLength(0);
	expect((await client`SELECT count(*)::int AS n FROM users`)[0].n).toBeGreaterThanOrEqual(before);
	const response = await request.get('/auth/callback?code=fake&state=wrong', { maxRedirects: 0 });
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe('/?error=login_failed');
});
