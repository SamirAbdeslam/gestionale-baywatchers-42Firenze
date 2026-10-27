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

for (const javaScriptEnabled of [true, false]) {
	test(
		`pool closure exports, reviews and resets only confirmed choices (JavaScript ${javaScriptEnabled})`,
		{ tag: '@shared-db' },
		async ({ browser }) => {
			const context = await browser.newContext({
				javaScriptEnabled,
				baseURL: 'http://localhost:4173',
				locale: 'it-IT',
				viewport: { width: 360, height: 800 }
			});
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const savedPools = await client`SELECT * FROM pools`;
			const savedEntries = await client`SELECT * FROM pool_entries`;
			const savedEvents = await client`SELECT * FROM events`;
			const savedRegistrations = await client`SELECT * FROM registrations`;
			const savedWhitelist = await client`SELECT * FROM whitelist`;
			const savedSettings = await client`SELECT * FROM settings`;
			const savedTemplates = await client`SELECT * FROM week_templates ORDER BY id`;
			const savedTemplateEvents = await client`SELECT * FROM template_events ORDER BY id`;
			try {
				await client`UPDATE settings SET active_week=4,display_week=3,pool_start='2026-10-19',pool_end='2026-11-15' WHERE id=1`;
				await page.goto('/auth/dev');
				await page.getByLabel('Utente esistente').selectOption({ label: 'dev_admin (admin)' });
				await page.getByRole('button', { name: 'Entra', exact: true }).click();
				await page.goto('/admin');
				await page.getByRole('link', { name: 'Chiudi piscina', exact: true }).click();
				await expect(
					page.getByRole('heading', { name: 'Chiudi piscina', exact: true })
				).toBeVisible();
				await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0);
				for (const name of ['Scarica CSV sintetico', 'Scarica CSV dettagliato']) {
					const download = page.waitForEvent('download');
					await page.getByRole('link', { name, exact: true }).click();
					expect((await download).suggestedFilename()).toMatch(
						/partecipanti_(sintetico|dettagliato)\.csv/
					);
				}
				const logsBefore = await client`SELECT * FROM action_logs ORDER BY id`;
				await page.getByRole('checkbox', { name: 'Ho scaricato i dati', exact: true }).check();
				await page.getByRole('button', { name: 'Rivedi le scelte', exact: true }).click();
				await expect(
					page.getByRole('dialog', { name: '3. Conferma la chiusura', exact: true })
				).toBeVisible();
				await expect(page.getByRole('dialog').getByRole('listitem')).toHaveCount(0);
				expect(await client`SELECT * FROM events`).toEqual(savedEvents);
				expect(await client`SELECT * FROM action_logs ORDER BY id`).toEqual(logsBefore);
				await page
					.getByRole('dialog')
					.getByRole('button', { name: 'Chiudi piscina', exact: true })
					.click();
				await expect(page.getByRole('status')).toContainText('archivio salvato');
				expect(
					await client`SELECT * FROM pool_entries WHERE pool_id=(SELECT id FROM pools WHERE start_date='2026-10-19')`
				).toHaveLength(savedRegistrations.length);
				expect(await client`SELECT * FROM events`).toEqual(savedEvents);
				expect(await client`SELECT * FROM registrations`).toEqual(savedRegistrations);
				expect(await client`SELECT * FROM whitelist`).toEqual(savedWhitelist);
				const logsAfterArchive = await client`SELECT * FROM action_logs ORDER BY id`;
				await page.getByRole('checkbox', { name: 'Ho scaricato i dati', exact: true }).check();
				await page.getByRole('checkbox', { name: 'Whitelist', exact: true }).check();
				await page.getByRole('button', { name: 'Rivedi le scelte', exact: true }).click();
				let dialog = page.getByRole('dialog', { name: '3. Conferma la chiusura', exact: true });
				await expect(dialog).toBeVisible();
				await expect(dialog.getByRole('listitem')).toHaveText(['Whitelist']);
				expect(await client`SELECT * FROM whitelist`).toEqual(savedWhitelist);
				expect(await client`SELECT * FROM action_logs ORDER BY id`).toEqual(logsAfterArchive);
				await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
				await expect(dialog).not.toBeVisible();
				await page.goto('/admin/close-pool');
				for (const name of [
					'Ho scaricato i dati',
					'Tutti gli eventi e le relative iscrizioni',
					'Whitelist',
					'Settimane attiva e display a 1',
					'Date del pool'
				]) {
					await page.getByRole('checkbox', { name, exact: true }).check();
				}
				await page.getByRole('button', { name: 'Rivedi le scelte', exact: true }).click();
				dialog = page.getByRole('dialog', { name: '3. Conferma la chiusura', exact: true });
				await expect(dialog.getByRole('listitem')).toHaveText([
					'Tutti gli eventi e le relative iscrizioni',
					'Whitelist',
					'Settimane attiva e display a 1',
					'Date del pool'
				]);
				await dialog.getByRole('button', { name: 'Chiudi piscina', exact: true }).click();
				await expect(page.getByRole('status')).toContainText('Piscina chiusa');
				await expect(page.getByRole('dialog')).toHaveCount(0);
				expect(await client`SELECT * FROM events`).toHaveLength(0);
				expect(await client`SELECT * FROM registrations`).toHaveLength(0);
				expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
				expect(
					(await client`SELECT active_week,display_week,pool_start,pool_end FROM settings`)[0]
				).toEqual({ active_week: 1, display_week: 1, pool_start: null, pool_end: null });
				expect(await client`SELECT * FROM week_templates ORDER BY id`).toEqual(savedTemplates);
				expect(await client`SELECT * FROM template_events ORDER BY id`).toEqual(
					savedTemplateEvents
				);
				const logs = await client`SELECT * FROM action_logs ORDER BY id`;
				expect(logs.slice(0, -1)).toEqual(logsAfterArchive);
				expect(await client`SELECT * FROM pools WHERE start_date='2026-10-19'`).toHaveLength(1);
				expect(
					await client`SELECT * FROM pool_entries WHERE pool_id=(SELECT id FROM pools WHERE start_date='2026-10-19')`
				).toHaveLength(savedRegistrations.length);
				expect(logs.at(-1)?.action_type).toBe('CLOSE_POOL');
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
					true
				);
				expect(errors).toEqual([]);
			} finally {
				await context.close();
				await client.begin(async (tx) => {
					await tx`DELETE FROM pools`;
					if (savedPools.length) await tx`INSERT INTO pools ${tx(savedPools)}`;
					if (savedEntries.length) await tx`INSERT INTO pool_entries ${tx(savedEntries)}`;
					await tx`DELETE FROM events`;
					if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
					if (savedRegistrations.length)
						await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
					await tx`DELETE FROM whitelist`;
					if (savedWhitelist.length) await tx`INSERT INTO whitelist ${tx(savedWhitelist)}`;
					await tx`DELETE FROM settings`;
					await tx`INSERT INTO settings ${tx(savedSettings)}`;
				});
			}
		}
	);
}
