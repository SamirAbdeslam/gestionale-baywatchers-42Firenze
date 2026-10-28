import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type APIRequestContext } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function login(request: APIRequestContext, name: string, admin = false) {
	const response = await request.post('/auth/dev', {
		form: { mode: 'create', login: name, ...(admin ? { admin: 'on' } : {}) },
		headers: { origin, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
}
for (const javaScriptEnabled of [true, false])
	test.describe(`enrollment JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'QR, login return, week selection, realtime counter, batch review and invalidation',
			{ tag: '@shared-db' },
			async ({ page, browser }) => {
				const prefix = `m26_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
				const studentName = `${prefix}_s`,
					adminName = `${prefix}_a`;
				const [config] = await client`SELECT * FROM settings`;
				const waitingBefore = await client`SELECT * FROM enrollment_requests`;
				const student = await browser.newContext({
					javaScriptEnabled,
					baseURL: origin,
					locale: 'it-IT'
				});
				const studentPage = await student.newPage();
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				studentPage.on('pageerror', (error) => errors.push(error.message));
				try {
					await client`DELETE FROM enrollment_requests`;
					await client`UPDATE settings SET enrollment_code=null,pool_start='2026-10-19',pool_end='2099-11-15',pool_closed_at=null,pool_reopened=false WHERE id=1`;
					await login(page.request, adminName, true);
					await page.goto('/admin/whitelist');
					await page.getByRole('button', { name: 'Apri iscrizioni', exact: true }).click();
					const show = page.getByRole('link', { name: 'Mostra QR', exact: true });
					await expect(show).toBeVisible();
					await show.click();
					const qr = javaScriptEnabled
						? page.getByRole('dialog', { name: 'QR per iscriversi alla piscina' })
						: page.locator('main');
					await expect(
						qr.getByRole('img', { name: 'QR per iscriversi alla piscina' })
					).toBeVisible();
					const joinUrl = await qr.locator('a.join-url').getAttribute('href');
					expect(joinUrl).toMatch(new RegExp(`^${origin}/join/[a-f0-9]{48}$`));
					if (javaScriptEnabled) {
						await page.keyboard.press('Escape');
						await expect(qr).toBeVisible();
						await qr.click({ position: { x: 3, y: 3 } });
						await expect(qr).toBeVisible();
						const bounds = await qr.boundingBox();
						const viewport = page.viewportSize()!;
						expect(bounds?.width).toBe(viewport.width);
						expect(bounds?.height).toBe(viewport.height);
					} else await expect(page).toHaveURL('/admin/enroll');
					const receivedBefore = Number(
						(await qr.getByRole('status').innerText()).split(':')[1].trim()
					);
					await studentPage.goto(joinUrl!);
					const dev = studentPage.getByRole('link', { name: 'Login di sviluppo', exact: true });
					await dev.click();
					await studentPage.getByLabel('Login', { exact: true }).fill(studentName);
					await studentPage.getByRole('button', { name: 'Crea ed entra', exact: true }).click();
					await expect(studentPage).toHaveURL(joinUrl!);
					await expect(studentPage.getByRole('dialog')).toBeVisible();
					await studentPage.getByRole('button', { name: 'Conferma richiesta' }).click();
					await expect(studentPage.getByRole('dialog').getByRole('alert')).toBeVisible();
					await studentPage.getByLabel('Settimana 1', { exact: true }).check();
					await studentPage.getByLabel('Settimana 3', { exact: true }).check();
					await studentPage.getByRole('button', { name: 'Conferma richiesta' }).click();
					await expect(
						studentPage.getByRole('heading', { name: 'Richiesta inviata: lo staff ti confermerà' })
					).toBeVisible();
					expect(
						(await client`SELECT weeks FROM enrollment_requests WHERE login=${studentName}`)[0]
							.weeks
					).toEqual([1, 3]);
					if (!javaScriptEnabled) await page.reload();
					await expect(qr.getByRole('status')).toHaveText(
						`Richieste ricevute: ${receivedBefore + 1}`
					);
					await page
						.getByRole(javaScriptEnabled ? 'button' : 'link', { name: 'Chiudi QR', exact: true })
						.click();
					await expect(page).toHaveURL('/admin/whitelist');
					const week1 = page.getByRole('region', { name: 'Settimana 1', exact: true });
					await expect(week1).toContainText(`@${studentName} in attesa`);
					await page.getByLabel('Seleziona tutti', { exact: true }).check();
					await page.getByRole('button', { name: 'Approva selezionati', exact: true }).click();
					await expect(week1).toContainText(`@${studentName} approvato`);
					expect(
						await client`SELECT * FROM enrollment_requests WHERE login=${studentName}`
					).toHaveLength(0);
					expect(
						(await client`SELECT weeks FROM whitelist WHERE login=${studentName}`)[0].weeks
					).toEqual([1, 3]);
					await studentPage.goto(joinUrl!);
					await expect(studentPage.getByRole('heading', { name: 'Sei già dentro' })).toBeVisible();
					// Bulk rejection must preserve approved people and count received requests.
					await client`INSERT INTO enrollment_requests (login,weeks) VALUES (${prefix + '_r1'},ARRAY[2]::smallint[]),(${prefix + '_r2'},ARRAY[4]::smallint[])`;
					const replay = await page.request.post('/admin/whitelist?/review', {
						form: { all: 'yes', allLogins: studentName, decision: 'approve' },
						headers: { origin, accept: 'text/html' }
					});
					expect(replay.status()).toBe(200);
					expect(
						await client`SELECT * FROM enrollment_requests WHERE login LIKE ${prefix + '%'}`
					).toHaveLength(2);
					await page.goto('/admin/whitelist');
					await page.getByLabel('Seleziona tutti', { exact: true }).check();
					await page.getByRole('button', { name: 'Rifiuta selezionati', exact: true }).click();
					await expect(
						page.getByText('Nessuna richiesta in attesa', { exact: true })
					).toBeVisible();
					expect(
						await client`SELECT * FROM action_logs WHERE action_type='WHITELIST_REJECT' AND actor_login=${adminName}`
					).toHaveLength(2);
					await page.getByRole('button', { name: 'Chiudi iscrizioni', exact: true }).click();
					await expect(
						page.getByRole('button', { name: 'Apri iscrizioni', exact: true })
					).toBeVisible();
					await studentPage.goto(joinUrl!);
					await expect(
						studentPage.getByRole('heading', { name: 'Le iscrizioni sono chiuse' })
					).toBeVisible();
					await page.getByRole('button', { name: 'Apri iscrizioni', exact: true }).click();
					await expect(show).toBeVisible();
					await page.getByRole('link', { name: 'Mostra QR', exact: true }).click();
					expect(await qr.locator('a.join-url').getAttribute('href')).not.toBe(joinUrl);
					await page
						.getByRole(javaScriptEnabled ? 'button' : 'link', { name: 'Chiudi QR', exact: true })
						.click();
					// The same-site validation also protects the development login used by this flow.
					const redirect = await studentPage.request.post('/auth/dev?to=//evil.example', {
						form: {
							mode: 'existing',
							userId: String((await client`SELECT id FROM users WHERE login=${studentName}`)[0].id)
						},
						headers: { origin, accept: 'text/html' },
						maxRedirects: 0
					});
					expect(redirect.headers().location).toBe('/calendar');
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
					expect(errors).toEqual([]);
				} finally {
					await student.close();
					await client`DELETE FROM enrollment_requests`;
					if (waitingBefore.length)
						await client`INSERT INTO enrollment_requests ${client(waitingBefore)}`;
					await client`DELETE FROM whitelist WHERE login LIKE ${prefix + '%'}`;
					await client`DELETE FROM action_logs WHERE actor_login LIKE ${prefix + '%'} OR resource_id LIKE ${prefix + '%'}`;
					await client`DELETE FROM users WHERE login LIKE ${prefix + '%'}`;
					await client`UPDATE settings SET ${client(config, 'enrollment_code', 'pool_start', 'pool_end', 'pool_closed_at', 'pool_reopened', 'updated_at')} WHERE id=1`;
				}
			}
		);
	});
