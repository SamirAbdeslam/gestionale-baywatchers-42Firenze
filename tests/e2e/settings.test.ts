import assert from 'node:assert/strict';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());

test(
	'admin edits pool dates, active week, event limit and resets the display week',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const [before] = await client`SELECT * FROM settings WHERE id=1`;
		try {
			await client`UPDATE settings SET display_week=3 WHERE id=1`;
			await page.goto('/auth/dev');
			await page.getByLabel('Utente esistente').selectOption({ label: 'dev_admin (admin)' });
			await page.getByRole('button', { name: 'Entra', exact: true }).click();
			await page.goto('/admin');
			await page.getByLabel('Inizio pool', { exact: true }).fill('2026-12-30');
			await page.getByLabel('Fine pool', { exact: true }).fill('2026-12-29');
			await page.getByRole('button', { name: 'Salva date pool', exact: true }).click();
			await expect(page.getByRole('alert')).toHaveText(
				/La fine del pool non può precedere la data di inizio/
			);
			expect((await client`SELECT pool_start FROM settings WHERE id=1`)[0].pool_start).toEqual(
				before.pool_start
			);
			await page.getByLabel('Inizio pool', { exact: true }).fill('2026-12-30');
			await page.getByLabel('Fine pool', { exact: true }).fill('');
			await page.getByRole('button', { name: 'Salva date pool', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			expect((await client`SELECT pool_end::text FROM settings WHERE id=1`)[0].pool_end).toBe(
				'2027-01-26'
			);
			await page.getByLabel('Settimana da attivare').selectOption('4');
			const activated = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('setActiveWeek')
			);
			await page.getByRole('button', { name: 'Attiva settimana', exact: true }).click();
			expect((await activated).status()).toBe(200);
			await page.goto('/admin');
			await expect(page.getByLabel('Settimana visualizzata')).toHaveValue('4');
			const dates = page.locator('.day-heading');
			await expect(dates).toHaveCount(7);
			await expect(dates.first()).toContainText('20 Gen');
			await expect(dates.last()).toContainText('26 Gen');
			await page.getByLabel('Settimana visualizzata').selectOption('2');
			await page.getByRole('button', { name: 'Mostra settimana', exact: true }).click();
			await expect(page).toHaveURL('/admin?week=2');
			await expect(dates.first()).toContainText('6 Gen');
			await expect(dates.last()).toContainText('12 Gen');
			for (const limit of [2, 0]) {
				await page
					.getByRole('spinbutton', { name: 'Limite eventi per utente e settimana' })
					.fill(String(limit));
				const saved = page.waitForResponse(
					(response) =>
						response.request().method() === 'POST' && response.url().includes('setMaxEvents')
				);
				await page.getByRole('button', { name: 'Salva limite', exact: true }).click();
				expect((await saved).status()).toBe(200);
				await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
				expect(
					(await client`SELECT max_events_per_user FROM settings WHERE id=1`)[0].max_events_per_user
				).toBe(limit);
			}
			await expect(page.getByText('Illimitato', { exact: true })).toBeVisible();
			const reset = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('resetDisplayWeek')
			);
			await page.getByRole('button', { name: 'Riporta la settimana display a 1' }).click();
			expect((await reset).status()).toBe(200);
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			expect(
				(await client`SELECT display_week,active_week FROM settings WHERE id=1`)[0]
			).toMatchObject({ display_week: 1, active_week: 4 });
			await page.setViewportSize({ width: 360, height: 800 });
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
			expect((await page.request.get('/admin?week=0')).status()).toBe(400);
		} finally {
			await client`UPDATE settings SET ${client(before, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
		}
	}
);

test(
	'cross-origin admin setting changes return 403 without writes or audit',
	{ tag: '@shared-db' },
	async ({ request }) => {
		const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
		const login = await request.post('/auth/dev', {
			form: { mode: 'existing', userId: String(admin.id) },
			headers: { origin: 'http://localhost:4173', accept: 'text/html' },
			maxRedirects: 0
		});
		expect(login.status()).toBe(303);
		const before = await client`SELECT * FROM settings`;
		const logs = await client`SELECT * FROM action_logs ORDER BY id`;
		const response = await request.post('/admin?/setActiveWeek', {
			form: { week: String(before[0].active_week === 4 ? 1 : 4) },
			headers: { origin: 'https://evil.example' },
			maxRedirects: 0
		});
		expect(response.status()).toBe(403);
		expect(await client`SELECT * FROM settings`).toEqual(before);
		expect(await client`SELECT * FROM action_logs ORDER BY id`).toEqual(logs);
	}
);

test(
	'all four settings work without JavaScript and reset ignores form input',
	{ tag: '@shared-db' },
	async ({ browser }) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			baseURL: 'http://localhost:4173'
		});
		const page = await context.newPage();
		const [before] = await client`SELECT * FROM settings WHERE id=1`;
		try {
			const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
			expect(
				(
					await context.request.post('/auth/dev', {
						form: { mode: 'existing', userId: String(admin.id) },
						headers: { origin: 'http://localhost:4173', accept: 'text/html' },
						maxRedirects: 0
					})
				).status()
			).toBe(303);
			await page.goto('/admin');
			await page.getByLabel('Inizio pool', { exact: true }).fill('2026-10-20');
			await page.getByLabel('Fine pool', { exact: true }).fill('2026-10-19');
			await page.getByRole('button', { name: 'Salva date pool', exact: true }).click();
			await expect(page.getByRole('alert')).toContainText(
				'La fine del pool non può precedere la data di inizio'
			);
			await page.getByLabel('Inizio pool', { exact: true }).fill('2026-10-20');
			await page.getByLabel('Fine pool', { exact: true }).fill('');
			await page.getByRole('button', { name: 'Salva date pool', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			await page.getByLabel('Settimana da attivare').selectOption('3');
			await page.getByRole('button', { name: 'Attiva settimana', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			await page
				.getByRole('spinbutton', { name: 'Limite eventi per utente e settimana' })
				.fill('2');
			await page.getByRole('button', { name: 'Salva limite', exact: true }).click();
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			await client`UPDATE settings SET display_week=3 WHERE id=1`;
			const reset = page.waitForResponse(
				(response) =>
					response.request().method() === 'POST' && response.url().includes('resetDisplayWeek')
			);
			await page.getByRole('button', { name: 'Riporta la settimana display a 1' }).click();
			expect((await reset).status()).toBe(200);
			await expect(page.getByRole('status')).toContainText('Impostazioni salvate');
			expect(
				(
					await client`SELECT pool_start::text,pool_end::text,active_week,max_events_per_user,display_week FROM settings WHERE id=1`
				)[0]
			).toMatchObject({
				pool_start: '2026-10-20',
				pool_end: '2026-11-16',
				active_week: 3,
				max_events_per_user: 2,
				display_week: 1
			});
			const response = await context.request.post('/admin?/resetDisplayWeek', {
				form: { week: 'ignored' },
				headers: { origin: 'http://localhost:4173' }
			});
			expect(response.status()).toBe(200);
		} finally {
			await client`UPDATE settings SET ${client(before, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
			await context.close();
		}
	}
);
