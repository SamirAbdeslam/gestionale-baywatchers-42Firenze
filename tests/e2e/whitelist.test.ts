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
const origin = 'http://localhost:4173';
for (const javaScriptEnabled of [true, false]) {
	test.describe(`whitelist with JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'adds mixed logins, lists dates, warns on duplicates and preserves bookings when removing',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const name = `m6_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
				const first = `${name}_a`,
					second = `${name}_z`,
					third = `${name}_m`;
				let eventId: number | undefined;
				const login = await page.request.post('/auth/dev', {
					form: { mode: 'create', login: name, admin: 'on' },
					headers: { origin, accept: 'text/html' },
					maxRedirects: 0
				});
				expect(login.status()).toBe(303);
				try {
					await page.goto('/admin/whitelist');
					await expect(page.getByRole('heading', { name: 'Whitelist', exact: true })).toBeVisible();
					const submit = page.getByRole('button', { name: 'Aggiungi alla whitelist', exact: true });
					await page
						.getByLabel('Login da aggiungere')
						.fill(
							`${second.toUpperCase()}, ${first}\n${third}\t${first.toUpperCase()} <img/src=x/onerror=alert(1)>`
						);
					let alerts = 0;
					page.on('dialog', async (dialog) => {
						alerts++;
						await dialog.dismiss();
					});
					await submit.click();
					await expect(
						page
							.getByRole('status')
							.filter({ hasText: `Aggiunti alla whitelist: ${first}, ${third}, ${second}` })
					).toBeVisible();
					await expect(
						page.getByRole('status').filter({ hasText: `Già presenti: ${first}` })
					).toBeVisible();
					await expect(
						page
							.getByRole('status')
							.filter({ hasText: 'Login non validi, ignorati: <img/src=x/onerror=alert(1)>' })
					).toBeVisible();
					const list = page.getByRole('list', { name: 'Whitelist', exact: true });
					const ownRows = list.getByRole('listitem').filter({ hasText: name });
					expect(await ownRows.locator('strong').allTextContents()).toEqual([first, third, second]);
					await expect(ownRows.first().locator('time')).toHaveAttribute('datetime', /T/);
					expect(alerts).toBe(0);
					await page.getByLabel('Login da aggiungere').fill(first.toUpperCase());
					await submit.click();
					await expect(
						page.getByRole('status').filter({ hasText: `Già presenti: ${first}` })
					).toBeVisible();
					const post = (action: string, form: Record<string, string>, requestOrigin = origin) =>
						page.request.post(`/admin/whitelist?/${action}`, {
							form,
							headers: { origin: requestOrigin, accept: 'text/html' }
						});
					const before = await client`SELECT * FROM whitelist ORDER BY id`;
					const logsBefore =
						await client`SELECT * FROM action_logs WHERE actor_login=${name} ORDER BY id`;
					expect(
						(await post('add', { logins: `${name}_csrf` }, 'https://evil.example')).status()
					).toBe(403);
					expect(
						(await post('remove', { id: String(before[0].id) }, 'https://evil.example')).status()
					).toBe(403);
					expect((await post('add', { logins: ' , \n ' })).status()).toBe(400);
					const missing = await post('remove', { id: '2147483647' });
					expect(missing.status()).toBe(404);
					expect(await missing.text()).toContain('Login non trovato nella whitelist');
					expect(await client`SELECT * FROM whitelist ORDER BY id`).toEqual(before);
					expect(
						await client`SELECT * FROM action_logs WHERE actor_login=${name} ORDER BY id`
					).toEqual(logsBefore);
					const [event] =
						await client`INSERT INTO events (title,week,weekday,start_time,end_time) VALUES (${name},4,1,'09:00','10:00') RETURNING id`;
					eventId = event.id as number;
					await client`INSERT INTO registrations (event_id,participant_login) VALUES (${eventId},${first})`;
					await ownRows
						.filter({ hasText: first })
						.getByRole('button', { name: 'Rimuovi dalla whitelist', exact: true })
						.click();
					await expect(ownRows.filter({ hasText: first })).toHaveCount(0);
					await expect(
						page.getByRole('status').filter({ hasText: `Rimosso dalla whitelist: ${first}` })
					).toBeVisible();
					expect(await client`SELECT * FROM registrations WHERE event_id=${eventId}`).toHaveLength(
						1
					);
					expect(
						(
							await client`SELECT action_type FROM action_logs WHERE actor_login=${name} AND action_type<>'LOGIN' ORDER BY id`
						).map((row) => row.action_type)
					).toEqual(['WHITELIST_ADD', 'WHITELIST_ADD', 'WHITELIST_ADD', 'WHITELIST_REMOVE']);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
				} finally {
					if (eventId !== undefined) await client`DELETE FROM events WHERE id=${eventId}`;
					await client`DELETE FROM whitelist WHERE login IN (${first},${second},${third})`;
					await client`DELETE FROM action_logs WHERE actor_login=${name}`;
					await client`DELETE FROM users WHERE login=${name}`;
				}
			}
		);
	});
}
