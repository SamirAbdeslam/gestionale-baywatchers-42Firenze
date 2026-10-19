import assert from 'node:assert/strict';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
const client = postgres(databaseUrl, { onnotice: () => {} });
test.afterAll(() => client.end());

test('admin edits pool dates, active week, event limit and resets the display week', async ({
	page
}) => {
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
		await expect(page.getByRole('status')).toHaveText('Dati non validi');
		expect((await client`SELECT pool_start FROM settings WHERE id=1`)[0].pool_start).toEqual(
			before.pool_start
		);
		await page.getByLabel('Inizio pool', { exact: true }).fill('2026-12-30');
		await page.getByLabel('Fine pool', { exact: true }).fill('');
		await page.getByRole('button', { name: 'Salva date pool', exact: true }).click();
		await expect(page.getByRole('status')).toHaveText('Impostazioni salvate');
		expect((await client`SELECT pool_end::text FROM settings WHERE id=1`)[0].pool_end).toBe(
			'2027-01-26'
		);
		await page.getByLabel('Settimana da attivare').selectOption('4');
		await page.getByRole('button', { name: 'Attiva settimana', exact: true }).click();
		await page.goto('/admin');
		await expect(page.getByLabel('Settimana visualizzata')).toHaveValue('4');
		const dates = page.getByRole('list', { name: 'Date della settimana' });
		await expect(dates.getByRole('listitem')).toHaveCount(7);
		await expect(dates).toContainText('20 Gen');
		await expect(dates).toContainText('26 Gen');
		await page.getByLabel('Settimana visualizzata').selectOption('2');
		await page.getByRole('button', { name: 'Mostra settimana', exact: true }).click();
		await expect(page).toHaveURL('/admin?week=2');
		await expect(dates).toContainText('6 Gen');
		await expect(dates).toContainText('12 Gen');
		for (const limit of [2, 0]) {
			await page
				.getByRole('spinbutton', { name: 'Limite eventi per utente e settimana' })
				.fill(String(limit));
			await page.getByRole('button', { name: 'Salva limite', exact: true }).click();
			await expect(page.getByRole('status')).toHaveText('Impostazioni salvate');
			expect(
				(await client`SELECT max_events_per_user FROM settings WHERE id=1`)[0].max_events_per_user
			).toBe(limit);
		}
		await expect(page.getByRole('definition').filter({ hasText: 'Illimitato' })).toBeVisible();
		await page.getByRole('button', { name: 'Riporta la settimana display a 1' }).click();
		await expect(page.getByRole('status')).toHaveText('Impostazioni salvate');
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
});
