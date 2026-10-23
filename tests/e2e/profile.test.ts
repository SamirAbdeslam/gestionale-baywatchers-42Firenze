import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
	test.describe(`profile JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'shows only own identity, bookings and earned totals, handles empty profiles and stays read-only',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const base = `m12_${randomUUID().slice(0, 8)}`,
					other = base + '_other';
				const displayName = '<img src=x onerror=alert(1)> ' + base;
				const secret = 'Other private event ' + base;
				const savedSettings = await client`SELECT * FROM settings WHERE id=1`;
				const response = await page.request.post('/auth/dev', {
					form: { mode: 'create', login: base },
					headers: { origin: 'http://localhost:4173', accept: 'text/html' },
					maxRedirects: 0
				});
				expect(response.status()).toBe(303);
				await client`UPDATE users SET display_name=${displayName},image_url='/badge.png',wallet=842 WHERE login=${base}`;
				const events =
					await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,compensation) VALUES
 (${base + ' later'},1,1,null,'11:00','11:20',25),
 (${base + ' first'},1,1,'2027-01-04','09:00','09:20',25),
 (${base + ' absent'},2,6,'2020-01-04','12:00','16:00',500),
 (${base + ' sunday'},4,7,'2027-01-31','10:00','10:20',999),
 (${secret},1,1,null,'09:00','12:00',999) RETURNING id`;
				const ids = events.map((event) => event.id as number);
				await client`INSERT INTO registrations(event_id,participant_login,attended) VALUES
 (${ids[0]},${base},true),(${ids[1]},${base},true),(${ids[2]},${base},false),(${ids[3]},${base},false),(${ids[4]},${other},true)`;
				await client`UPDATE settings SET pool_start='2026-10-26',pool_end='2026-11-22',active_week=1 WHERE id=1`;
				const before =
					await client`SELECT * FROM registrations WHERE event_id=ANY(${ids}::int[]) ORDER BY id`;
				let alerts = 0;
				page.on('dialog', async (dialog) => {
					alerts++;
					await dialog.dismiss();
				});
				try {
					await page.goto('/calendar');
					await page.getByRole('link', { name: 'Profilo', exact: true }).click();
					await expect(page).toHaveURL('/profile');
					const identity = page.getByRole('region', { name: 'Profilo', exact: true });
					await expect(
						identity.getByRole('heading', { name: displayName, exact: true })
					).toBeVisible();
					await expect(identity.getByText('@' + base, { exact: true })).toBeVisible();
					await expect(identity.getByRole('img')).toHaveAttribute('src', '/badge.png');
					const stats = identity.locator('dd');
					await expect(stats.nth(0)).toHaveText('842₳');
					await expect(stats.nth(1)).toHaveText('4');
					await expect(stats.nth(2)).toHaveText('0,7');
					await expect(stats.nth(3)).toHaveText('50₳');
					const first = page.getByRole('region', { name: 'Settimana 1', exact: true });
					expect(await first.getByRole('rowheader').allTextContents()).toEqual([
						base + ' first',
						base + ' later'
					]);
					await expect(first).toContainText('4 Gen');
					await expect(first).toContainText('26 Ott');
					await expect(first).toContainText('In programma');
					const absent = page
						.getByRole('row')
						.filter({ has: page.getByRole('rowheader', { name: base + ' absent', exact: true }) });
					await expect(absent).toHaveClass(/\babsent\b/);
					await expect(absent).toContainText('Sabato');
					await expect(absent).toContainText('Non partecipato');
					await expect(
						page.getByRole('region', { name: 'Settimana 4', exact: true })
					).toContainText('Domenica');
					await expect(page.getByRole('region', { name: 'Settimana 3', exact: true })).toHaveCount(
						0
					);
					await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
					await expect(page.getByRole('heading', { name: /notific/i })).toHaveCount(0);
					expect(alerts).toBe(0);
					const injected = await page.request.get(
						'/profile/__data.json?login=' + other + '&userId=1'
					);
					expect(injected.status()).toBe(200);
					expect(await injected.text()).not.toContain(secret);
					expect(
						await client`SELECT * FROM registrations WHERE event_id=ANY(${ids}::int[]) ORDER BY id`
					).toEqual(before);
					expect(
						await client`SELECT * FROM action_logs WHERE actor_login=${base} AND action_type<>'LOGIN'`
					).toHaveLength(0);
					await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
					await page.reload();
					await expect(first).toContainText('Data non impostata');
					await expect(first).toContainText('4 Gen');
					await client`DELETE FROM registrations WHERE participant_login=${base}`;
					await client`UPDATE users SET display_name=null,image_url=null,wallet=901 WHERE login=${base}`;
					await page.goto('/profile?login=' + other);
					await expect(identity.getByRole('heading', { name: base, exact: true })).toBeVisible();
					await expect(identity.getByRole('img')).toHaveCount(0);
					await expect(stats.nth(0)).toHaveText('901₳');
					await expect(stats.nth(1)).toHaveText('0');
					await expect(stats.nth(2)).toHaveText('0');
					await expect(stats.nth(3)).toHaveText('0₳');
					await expect(
						page.getByText('Non sei iscritto a nessun evento', { exact: true })
					).toBeVisible();
					await expect(page.getByRole('table')).toHaveCount(0);
					await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
				} finally {
					await page.goto('/');
					await client.begin(async (tx) => {
						await tx`DELETE FROM events WHERE id=ANY(${ids}::int[])`;
						await tx`DELETE FROM action_logs WHERE actor_login=${base}`;
						await tx`DELETE FROM users WHERE login=${base}`;
						await tx`UPDATE settings SET ${tx(savedSettings[0])} WHERE id=1`;
					});
				}
			}
		);
	});
}
