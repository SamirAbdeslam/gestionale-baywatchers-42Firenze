import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
	test.describe(`reports JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'shows attended totals, absent details and safe CSV downloads without writes',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const base = `m11_${randomUUID().slice(0, 8)}`,
					first = base + '_a',
					second = base + '_z',
					login = base + '_admin';
				await page.request.post('/auth/dev', {
					form: { mode: 'create', login, admin: 'on' },
					headers: { origin: 'http://localhost:4173', accept: 'text/html' },
					maxRedirects: 0
				});
				const entries =
					await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,compensation) VALUES
 ('=SUM(1,2)',1,7,'2027-01-31','09:00','10:30',200),
 (${'<img src=x onerror=alert(1)> ' + base},2,1,'2027-01-25','09:00','09:20',100),
 (${base + ' absent'},4,7,null,'11:00','12:00',999),
 (${base + ' only absent'},3,6,null,'10:00','11:00',500) RETURNING id`;
				const ids = entries.map((row) => row.id as number);
				await client`INSERT INTO registrations(event_id,participant_login,attended,registered_at) VALUES
 (${ids[0]},${first},true,'2026-10-22T07:00:00Z'),(${ids[1]},${first},true,'2026-10-22T07:00:00Z'),
 (${ids[2]},${first},false,'2026-10-22T07:00:00Z'),(${ids[3]},${second},false,'2026-10-22T07:00:00Z')`;
				const before =
					await client`SELECT * FROM registrations WHERE event_id=ANY(${ids}::int[]) ORDER BY id`;
				let alerts = 0;
				page.on('dialog', async (dialog) => {
					alerts++;
					await dialog.dismiss();
				});
				try {
					await page.goto('/admin/participants');
					const row = page
						.getByRole('row')
						.filter({ has: page.getByRole('rowheader', { name: first, exact: true }) });
					const absent = page
						.getByRole('row')
						.filter({ has: page.getByRole('rowheader', { name: second, exact: true }) });
					// Cell 0 is the decorative attendance column.
					await expect(row.getByRole('cell').nth(1)).toHaveText('2');
					await expect(row.getByRole('cell').nth(2)).toHaveText('1,83');
					await expect(row.getByRole('cell').nth(3)).toHaveText('300');
					for (let index = 1; index < 4; index++)
						await expect(absent.getByRole('cell').nth(index)).toHaveText('0');
					await row.locator('summary').click();
					await expect(row.getByRole('region', { name: 'Settimana 1', exact: true })).toContainText(
						'=SUM(1,2)'
					);
					await expect(row.getByRole('region', { name: 'Settimana 2', exact: true })).toContainText(
						'<img src=x onerror=alert(1)>'
					);
					await expect(row.getByRole('region', { name: 'Settimana 4', exact: true })).toContainText(
						'NON PARTECIPATO'
					);
					await expect(row.getByRole('region', { name: 'Settimana 1', exact: true })).toContainText(
						'Domenica'
					);
					await expect(row.locator('img')).toHaveCount(0);
					expect(alerts).toBe(0);
					if (javaScriptEnabled) {
						await page.getByLabel('Cerca per login', { exact: true }).fill(first.toUpperCase());
						await expect(row).toBeVisible();
						await expect(absent).toHaveCount(0);
						await page.getByLabel('Cerca per login', { exact: true }).fill('no_such_' + base);
						await expect(
							page.getByText('Nessun login corrispondente', { exact: true })
						).toBeVisible();
						await page.getByLabel('Cerca per login', { exact: true }).fill('');
					}
					for (const [label, filename, needle] of [
						['Scarica CSV sintetico', 'partecipanti_sintetico.csv', `${first},2,1.83,300\r\n`],
						['Scarica CSV dettagliato', 'partecipanti_dettagliato.csv', 'NON PARTECIPATO'],
						['Scarica CSV partecipante', `partecipante_${first}.csv`, '"\'=SUM(1,2)"']
					]) {
						const pending = page.waitForEvent('download');
						const link =
							label === 'Scarica CSV partecipante'
								? row.getByRole('link', { name: label, exact: true })
								: page.getByRole('link', { name: label, exact: true });
						await link.click();
						const download = await pending;
						expect(download.suggestedFilename()).toBe(filename);
						const path = await download.path();
						assert(path);
						const content = await readFile(path, 'utf8');
						expect(content).toContain(needle);
						expect(content.endsWith('\r\n')).toBe(true);
						expect(content.replaceAll('\r\n', '')).not.toContain('\n');
					}
					expect((await page.request.get('/admin/participants/bad%20login.csv')).status()).toBe(
						400
					);
					expect(
						await client`SELECT * FROM registrations WHERE event_id=ANY(${ids}::int[]) ORDER BY id`
					).toEqual(before);
					expect(
						await client`SELECT * FROM action_logs WHERE actor_login=${login} AND action_type<>'LOGIN'`
					).toHaveLength(0);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
				} finally {
					await client`DELETE FROM events WHERE id=ANY(${ids}::int[])`;
					await client`DELETE FROM action_logs WHERE actor_login=${login}`;
					await client`DELETE FROM users WHERE login=${login}`;
				}
			}
		);
	});
}
