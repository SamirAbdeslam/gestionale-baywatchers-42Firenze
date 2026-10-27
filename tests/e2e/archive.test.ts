import assert from 'node:assert/strict';
import postgres from 'postgres';
import { expect, test } from '@playwright/test';
import { writeCsv } from '../../src/lib/server/domain/csv.ts';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const csv = writeCsv([
	['Nome Partecipante', 'Eventi Partecipati', 'Numero Eventi', 'Totale Ore', 'Totale Altarian'],
	[
		'archive_student',
		'Esami (turno 1) (Lunedì 02/05/2005, 1.5h, 200₳) | Rush (Martedì 03/05/2005, 1h, NON PARTECIPATO)',
		1,
		1.5,
		200
	],
	['archive_other', 'Cluster (Mercoledì 04/05/2005, 2h, 100₳)', 1, 2, 100],
	['skipped', '<img src=x onerror=alert(1)> | Ambiguo (Lunedì 02/05/2005, 1h, 0₳)', 1, 1, 0]
]);

for (const javaScriptEnabled of [true, false]) {
	test.describe(`archive JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'previews without writes, imports, selects a pool, rejects duplicates and shows the finished notice',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('dialog', (dialog) => {
					errors.push(dialog.message());
					void dialog.dismiss();
				});
				const [config] = await client`SELECT * FROM settings WHERE id=1`;
				const events = await client`SELECT id,event_date FROM events ORDER BY id`;
				let importedId: number | undefined;
				try {
					await page.goto('/auth/dev');
					await page.getByLabel('Utente esistente').selectOption({ label: 'dev_admin (admin)' });
					await page.getByRole('button', { name: 'Entra', exact: true }).click();
					await page.goto('/admin');
					await page.getByRole('link', { name: 'Archivio piscine', exact: true }).click();
					await expect(
						page.getByRole('heading', { name: 'Archivio piscine', exact: true })
					).toBeVisible();
					const poolsBefore = await client`SELECT * FROM pools ORDER BY id`;
					const entriesBefore = await client`SELECT * FROM pool_entries ORDER BY id`;
					const logsBefore =
						await client`SELECT * FROM action_logs WHERE action_type='IMPORT_POOL' ORDER BY id`;
					const preview = async () => {
						await page.getByLabel('Mese e anno di inizio', { exact: true }).fill('2005-05');
						await page
							.getByLabel('File CSV (massimo 1 MB e 2000 righe)', { exact: true })
							.setInputFiles({
								name: 'detailed.csv',
								mimeType: 'text/csv',
								buffer: Buffer.from(csv)
							});
						await page.getByRole('button', { name: 'Anteprima importazione', exact: true }).click();
						await expect(
							page.getByRole('heading', { name: /Anteprima importazione — maggio 2005/ })
						).toBeVisible();
					};
					await preview();
					await expect(
						page.getByText('Righe lette: 3. Voci da importare: 3. Righe o voci saltate: 1.', {
							exact: true
						})
					).toBeVisible();
					await expect(page.locator('.skipped')).toContainText('intera riga saltata');
					await expect(page.locator('.skipped img')).toHaveCount(0);
					expect(await client`SELECT * FROM pools ORDER BY id`).toEqual(poolsBefore);
					expect(await client`SELECT * FROM pool_entries ORDER BY id`).toEqual(entriesBefore);
					expect(
						await client`SELECT * FROM action_logs WHERE action_type='IMPORT_POOL' ORDER BY id`
					).toEqual(logsBefore);
					await page
						.getByRole('checkbox', {
							name: 'Ho verificato l’anteprima e le voci saltate',
							exact: true
						})
						.check();
					await page.getByRole('button', { name: 'Conferma importazione', exact: true }).click();
					await expect(page.getByRole('status')).toContainText('Piscina importata.');
					const [pool] = await client`SELECT * FROM pools WHERE start_date='2005-05-01'`;
					importedId = pool.id;
					expect(pool.source).toBe('csv');
					expect(await client`SELECT * FROM pool_entries WHERE pool_id=${pool.id}`).toHaveLength(3);
					await page.getByLabel('Anno', { exact: true }).selectOption('2005');
					await page.getByRole('button', { name: 'Mostra l’anno', exact: true }).click();
					await expect(page.getByRole('combobox', { name: 'Piscina', exact: true })).toContainText(
						'maggio 2005'
					);
					await page.getByRole('button', { name: 'Mostra piscina', exact: true }).click();
					await expect(
						page.getByRole('heading', { name: 'maggio 2005', exact: true })
					).toBeVisible();
					await expect(page.getByRole('row', { name: /archive_student/ })).toContainText('50%');
					await expect(page.getByRole('row', { name: /archive_other/ })).toContainText('100%');
					await expect(
						page.getByRole('img', { name: 'Turni effettuati per tipo', exact: true })
					).toBeVisible();
					await expect(
						page.getByRole('img', { name: 'Distribuzione dei tipi di turno', exact: true })
					).toBeVisible();
					await page.setViewportSize({ width: 360, height: 800 });
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
					).toBe(true);
					await preview();
					await page
						.getByRole('checkbox', {
							name: 'Ho verificato l’anteprima e le voci saltate',
							exact: true
						})
						.check();
					await page.getByRole('button', { name: 'Conferma importazione', exact: true }).click();
					await expect(page.getByRole('alert')).toContainText(
						'Esiste già una piscina con la stessa data di inizio.'
					);
					expect(await client`SELECT * FROM pools WHERE start_date='2005-05-01'`).toHaveLength(1);
					expect(await client`SELECT * FROM pool_entries WHERE pool_id=${pool.id}`).toHaveLength(3);
					expect(
						await client`SELECT * FROM action_logs WHERE action_type='IMPORT_POOL' AND resource_id=${String(pool.id)}`
					).toHaveLength(1);
					await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start='2000-01-03',pool_end='2000-12-31' WHERE id=1`;
					await client`UPDATE events SET event_date=null`;
					await page.goto('/admin');
					await expect(page.getByRole('status')).toContainText('La piscina è finita');
					await page.goto('/admin');
					await page.getByRole('link', { name: 'Archivio piscine', exact: true }).click();
					await page.getByLabel('Anno', { exact: true }).selectOption('2000');
					await page.getByRole('button', { name: 'Mostra l’anno', exact: true }).click();
					await expect(page.getByRole('heading', { name: /gennaio 2000/ })).toBeVisible();
					expect(errors).toEqual([]);
				} finally {
					await client`DELETE FROM pools WHERE start_date='2000-01-03'`;
					if (importedId !== undefined) {
						await client`DELETE FROM pools WHERE id=${importedId}`;
						await client`DELETE FROM action_logs WHERE action_type='IMPORT_POOL' AND resource_id=${String(importedId)}`;
					}
					await client`UPDATE settings SET ${client(config, 'pool_start', 'pool_end', 'pool_closed_at', 'pool_reopened')} WHERE id=1`;
					for (const event of events)
						await client`UPDATE events SET event_date=${event.event_date} WHERE id=${event.id}`;
				}
			}
		);
	});
}
