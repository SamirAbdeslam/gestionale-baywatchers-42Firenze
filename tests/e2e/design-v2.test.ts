import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
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
	test.describe(`design v2 JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'keeps compact tickets, seven desktop days, mobile scrolling and settings accessible',
			{ tag: '@shared-db' },
			async ({ page, context, browserName }, info) => {
				info.setTimeout(60000);
				const login = `v2_${randomUUID().slice(0, 8)}`;
				const [settings] = await client`SELECT * FROM settings WHERE id=1`;
				const savedEvents = await client`SELECT * FROM events WHERE week=4`;
				const savedRegistrations =
					await client`SELECT r.* FROM registrations r JOIN events e ON e.id=r.event_id WHERE e.week=4`;
				await page.request.post('/auth/dev', {
					form: { mode: 'create', login, admin: 'on' },
					headers: { origin: 'http://localhost:4173', accept: 'text/html' },
					maxRedirects: 0
				});
				try {
					await client`DELETE FROM events WHERE week=4`;
					await client`UPDATE settings SET active_week=4,pool_start='2000-01-03',pool_end='2099-12-31',max_events_per_user=0 WHERE id=1`;
					const rows = Array.from({ length: 14 }, (_, i) => ({
						title: `Compact ${i + 1} · Titolo di un turno lungo da leggere in due righe`,
						kind: ['exam', 'icebreaker', 'rush', 'cluster', 'welcome', 'custom'][i % 6],
						week: 4,
						weekday: Math.floor(i / 2) + 1,
						start_time: i % 2 ? '11:00' : '09:00',
						end_time: i % 2 ? '13:00' : '11:00',
						max_slots: 3,
						compensation: 200
					}));
					const inserted = await client`INSERT INTO events ${client(rows)} RETURNING id,weekday`;
					await client`INSERT INTO registrations(event_id,participant_login) VALUES (${inserted.find((row) => row.weekday === 3)!.id},${login})`;
					await page.clock.setFixedTime(new Date('2000-01-26T12:00:00+01:00'));
					await page.emulateMedia({ reducedMotion: 'reduce' });
					const errors: string[] = [];
					page.on('pageerror', (error) => errors.push(error.message));
					page.on('console', (message) => {
						if (message.type() === 'error') errors.push(message.text());
					});
					for (const theme of ['light', 'dark']) {
						await context.addCookies([
							{ name: 'theme', value: theme, url: 'http://localhost:4173' }
						]);
						const capture = async (name: string) => {
							if (
								!javaScriptEnabled ||
								process.env.UPDATE_DESIGN_SCREENSHOTS !== '1' ||
								browserName !== 'chromium'
							)
								return;
							const destination = path.join('docs/v2/design/implemented', theme, `v2-${name}.png`);
							await mkdir(path.dirname(destination), { recursive: true });
							await page.screenshot({ path: destination, animations: 'disabled' });
						};
						await page.setViewportSize({ width: 1280, height: 900 });
						await page.goto('/calendar?week=4');
						const calendar = page.getByRole('region', {
							name: 'Eventi della settimana',
							exact: true
						});
						const panels = calendar.locator(':scope > section');
						const bounds = (await calendar.boundingBox())!;
						expect(
							(await panels.nth(4).boundingBox())!.x + (await panels.nth(4).boundingBox())!.width
						).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
						const second = (await panels.first().locator('.ticket').nth(1).boundingBox())!;
						expect(second.y + second.height).toBeLessThanOrEqual(900);
						await expect(
							panels.first().locator('.ticket-stub .ticket-title').first()
						).toContainText('Compact 1');
						await expect(panels.first().locator('.ticket-body').first()).not.toContainText('5 Gen');
						await capture('1280-calendario-compatto');
						await page.setViewportSize({ width: 1920, height: 1080 });
						expect(
							await calendar.evaluate((element) => element.scrollWidth === element.clientWidth)
						).toBe(true);
						await expect(panels).toHaveCount(7);
						const contrast = await panels
							.locator('.ticket-stub, .participant')
							.evaluateAll((elements) => {
								const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);
								const canvas = rgba(getComputedStyle(document.body).backgroundColor);
								const luminance = (rgb: number[]) =>
									rgb
										.slice(0, 3)
										.map((c) => c / 255)
										.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
										.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
								return Math.min(
									...elements.map((element) => {
										const style = getComputedStyle(element);
										const foreground = luminance(rgba(style.color));
										const background = rgba(style.backgroundColor);
										const alpha = background[3] ?? 1;
										const blended = luminance(
											background.slice(0, 3).map((c, i) => c * alpha + canvas[i] * (1 - alpha))
										);
										return (
											(Math.max(foreground, blended) + 0.05) /
											(Math.min(foreground, blended) + 0.05)
										);
									})
								);
							});
						expect(contrast).toBeGreaterThanOrEqual(4.5);
						await capture('1920-calendario');
						await page.getByRole('button', { name: /^Menu utente di / }).click();
						await expect(page.locator('#user-menu')).toBeVisible();
						await capture('1920-menu-utente');
						await page.keyboard.press('Escape');
						await page.setViewportSize({ width: 360, height: 800 });
						await page.reload();
						const mobileBounds = (await calendar.boundingBox())!;
						expect((await panels.first().boundingBox())!.width / mobileBounds.width).toBeCloseTo(
							0.88,
							2
						);
						if (javaScriptEnabled) {
							await expect(page.getByRole('tab', { name: /^Mer/ })).toHaveAttribute(
								'aria-selected',
								'true'
							);
							await page.getByRole('tab', { name: /^Lun/ }).click();
						} else {
							await page
								.getByRole('navigation', { name: 'Giorni della settimana' })
								.getByRole('link', { name: /^Lun/ })
								.click();
						}
						await capture('360-inizio-settimana');
						if (
							javaScriptEnabled &&
							process.env.UPDATE_DESIGN_SCREENSHOTS === '1' &&
							browserName === 'chromium'
						) {
							const session = await context.newCDPSession(page);
							await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
							const box = (await calendar.boundingBox())!;
							const x = box.x + box.width - 32,
								y = box.y + 80;
							await session.send('Input.dispatchTouchEvent', {
								type: 'touchStart',
								touchPoints: [{ x, y }]
							});
							try {
								for (const distance of [40, 80, 120])
									await session.send('Input.dispatchTouchEvent', {
										type: 'touchMove',
										touchPoints: [{ x: x - distance, y }]
									});
								await expect
									.poll(() => calendar.evaluate((element) => element.scrollLeft))
									.toBeGreaterThan(30);
								await capture('360-durante-scorrimento');
							} finally {
								await session.send('Input.dispatchTouchEvent', {
									type: 'touchEnd',
									touchPoints: []
								});
								await session.detach();
							}
						}
						if (javaScriptEnabled) {
							await calendar.evaluate((element) => {
								const sections = element.querySelectorAll<HTMLElement>(':scope > section');
								element.scrollTo({
									left: sections[1].offsetLeft - sections[0].offsetLeft,
									behavior: 'instant'
								});
							});
							await expect(page.getByRole('tab', { name: /^Mar/ })).toHaveAttribute(
								'aria-selected',
								'true'
							);
							await page.getByRole('tab', { name: /^Mer/ }).click();
						} else {
							await page
								.getByRole('navigation', { name: 'Giorni della settimana' })
								.getByRole('link', { name: /^Mer/ })
								.click();
						}
						await expect(panels.nth(2).locator('.ticket.mine')).toHaveCount(1);
						await capture('360-turno-mio');
						await page.getByRole('button', { name: /^Menu utente di / }).click();
						await expect(page.locator('#user-menu')).toBeVisible();
						await capture('360-menu-utente');
						await page.keyboard.press('Escape');
						await page.goto('/admin?week=4');
						const settingsPanel = page.locator('.settings-panel');
						await expect(settingsPanel).not.toHaveAttribute('open');
						await expect(page.getByLabel('Inizio pool', { exact: true })).not.toBeVisible();
						await capture('360-admin-impostazioni-chiuse');
						await settingsPanel.locator(':scope > summary').click();
						await expect(page.getByLabel('Inizio pool', { exact: true })).toBeVisible();
						await capture('360-admin-impostazioni-aperte');
						await page.setViewportSize({ width: 1920, height: 1080 });
						const grid = page.locator('.days-grid');
						expect(
							await grid.evaluate((element) => element.scrollWidth === element.clientWidth)
						).toBe(true);
						await capture('1920-admin-compatto');
						await page.setViewportSize({ width: 1280, height: 900 });
						expect(
							await grid.evaluate((element) => element.scrollWidth > element.clientWidth)
						).toBe(true);
						const controlsFit = await page
							.locator(
								'.settings-grid input:visible, .settings-grid select:visible, .settings-grid button:visible'
							)
							.evaluateAll((controls) =>
								controls.every((control) => {
									const bounds = control.getBoundingClientRect();
									const section = control.closest('section')!.getBoundingClientRect();
									return bounds.left >= section.left && bounds.right <= section.right;
								})
							);
						expect(controlsFit).toBe(true);
						await expect(page.getByLabel('Inizio pool', { exact: true })).toBeVisible();
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
					expect(errors).toEqual([]);
				} finally {
					await page.goto('/');
					await client.begin(async (tx) => {
						await tx`DELETE FROM events WHERE week=4`;
						if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
						if (savedRegistrations.length)
							await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
						await tx`UPDATE settings SET ${tx(settings)} WHERE id=1`;
						await tx`DELETE FROM action_logs WHERE actor_login=${login}`;
						await tx`DELETE FROM users WHERE login=${login}`;
					});
				}
			}
		);
	});
}
