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
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('console', (message) => {
					if (message.type() !== 'error') return;
					const expected404 =
						message.location().url.includes('/avatar/') && /404/.test(message.text());
					if (!expected404) errors.push(message.text());
				});
				let alerts = 0;
				page.on('dialog', async (dialog) => {
					alerts++;
					await dialog.dismiss();
				});
				try {
					await page.goto('/calendar');
					await page.getByRole('button', { name: /^Menu utente di / }).click();
					await page
						.getByRole('navigation', { name: 'Menu utente', exact: true })
						.getByRole('link', { name: 'Profilo', exact: true })
						.click();
					await expect(page).toHaveURL('/profile');
					const identity = page.getByRole('region', { name: 'Profilo', exact: true });
					await expect(
						identity.getByRole('heading', { name: displayName, exact: true })
					).toBeVisible();
					await expect(identity.getByText('@' + base, { exact: true })).toBeVisible();
					const missingAvatar = await page.request.get('/avatar/' + base);
					expect(missingAvatar.status()).toBe(404);
					expect(missingAvatar.headers()['cache-control']).toBe('private, no-store');
					if (javaScriptEnabled) {
						await expect(identity.getByRole('img')).toHaveCount(0);
						await expect(identity.locator('.avatar')).not.toBeEmpty();
					} else {
						await expect(identity.getByRole('img')).toHaveJSProperty(
							'src',
							'http://localhost:4173/avatar/' + base
						);
						await expect(identity.getByRole('img')).toHaveAttribute(
							'alt',
							'Immagine di ' + displayName
						);
					}
					const pageData = await page.request.get('/profile/__data.json');
					expect(await pageData.text()).not.toContain('imageUrl');
					expect(await pageData.text()).not.toContain('/badge.png');
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
					expect(errors).toEqual([]);
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

test(
	'uses same-origin avatars in header and profile without sending CDN URLs to the client',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const login = `avatar_${randomUUID().slice(0, 8)}`;
		const cdnUrl = 'https://cdn.intra.42.fr/users/private-test-photo.jpg';
		await page.request.post('/auth/dev', {
			form: { mode: 'create', login },
			headers: { origin: 'http://localhost:4173', accept: 'text/html' },
			maxRedirects: 0
		});
		try {
			await client`UPDATE users SET image_url=${cdnUrl}, display_name='Avatar Student' WHERE login=${login}`;
			const bytes = await readFile('static/badge.png');
			await page.route('**/avatar/' + login, (route) =>
				route.fulfill({ status: 200, contentType: 'image/png', body: bytes })
			);
			const external: string[] = [];
			page.on('request', (request) => {
				if (new URL(request.url()).hostname === 'cdn.intra.42.fr') external.push(request.url());
			});
			await page.goto('/profile');
			const profile = page.getByRole('region', { name: 'Profilo', exact: true });
			const header = page.locator('.site-header');
			for (const area of [profile, header]) {
				await expect(area.locator('.avatar img')).toHaveJSProperty(
					'src',
					'http://localhost:4173/avatar/' + login
				);
				await expect
					.poll(() =>
						area.locator('.avatar img').evaluate((img) => (img as HTMLImageElement).naturalWidth)
					)
					.toBeGreaterThan(0);
			}
			const data = await page.request.get('/profile/__data.json');
			expect(await data.text()).not.toContain(cdnUrl);
			expect(await data.text()).not.toContain('imageUrl');
			expect(await page.content()).not.toContain(cdnUrl);
			expect(external).toEqual([]);
		} finally {
			await page.goto('/');
			await client`DELETE FROM action_logs WHERE actor_login=${login}`;
			await client`DELETE FROM users WHERE login=${login}`;
		}
	}
);

for (const beforeHydration of [true, false]) {
	test(
		`falls back to initials without CSP violations when the image fails ${beforeHydration ? 'before' : 'after'} hydration`,
		{ tag: '@shared-db' },
		async ({ page }) => {
			const login = `missing_${randomUUID().slice(0, 8)}`;
			await page.request.post('/auth/dev', {
				form: { mode: 'create', login },
				headers: { origin: 'http://localhost:4173', accept: 'text/html' },
				maxRedirects: 0
			});
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (/Content Security Policy|securitypolicyviolation/i.test(message.text()))
					errors.push(message.text());
			});
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			await page.route(
				beforeHydration ? '**/_app/**/*.js' : '**/avatar/' + login,
				async (route) => {
					await gate;
					await route.continue();
				}
			);
			try {
				await client`UPDATE users SET image_url='https://example.test/missing.jpg', display_name='Missing Student' WHERE login=${login}`;
				await page.goto('/profile', { waitUntil: 'commit' });
				if (beforeHydration) {
					await page.waitForFunction(() => {
						const image = document.querySelector('.profile .avatar img') as HTMLImageElement | null;
						return image?.complete && image.naturalWidth === 0;
					});
				} else {
					await expect(page.locator('.theme-switch')).toBeVisible();
					await expect(page.locator('.profile .avatar img')).toHaveJSProperty('complete', false);
				}
				await expect(page.locator('.profile .avatar img')).toHaveCount(1);
				await expect(page.locator('.profile .avatar img')).not.toHaveAttribute('onerror');
				release();
				await expect(page.locator('.profile .avatar img')).toHaveCount(0);
				await expect(page.locator('.profile .avatar')).toHaveText('MS');
				await expect(page.locator('.site-header .avatar')).toHaveText('MS');
				expect(errors).toEqual([]);
			} finally {
				release();
				await page.goto('/');
				await client`DELETE FROM action_logs WHERE actor_login=${login}`;
				await client`DELETE FROM users WHERE login=${login}`;
			}
		}
	);
}
