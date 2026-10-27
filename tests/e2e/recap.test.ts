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
for (const options of [
	{ javaScriptEnabled: true, reducedMotion: 'no-preference' },
	{ javaScriptEnabled: false, reducedMotion: 'no-preference' },
	{ javaScriptEnabled: true, reducedMotion: 'reduce' }
] as const)
	test.describe(`recap JS ${options.javaScriptEnabled}, motion ${options.reducedMotion}`, () => {
		test.use(options);
		test(
			'shows phase views, private recaps, imported gaps and staff totals',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const login = 'recap_' + randomUUID().slice(0, 8);
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				const [config] = await client`SELECT * FROM settings WHERE id=1`;
				const savedEvents = await client`SELECT id,event_date FROM events`;
				let poolId: number | undefined;
				let csvId: number | undefined;
				let eventId: number | undefined;
				try {
					expect((await page.request.get('/recap', { maxRedirects: 0 })).status()).toBe(303);
					expect((await page.request.get('/recap/1', { maxRedirects: 0 })).status()).toBe(303);
					await page.request.post('/auth/dev', {
						form: { mode: 'create', login },
						headers: { origin, accept: 'text/html' },
						maxRedirects: 0
					});
					await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
					await page.goto('/calendar');
					await expect(page.getByText(/Ehi, qui è tutto vuoto/)).toBeVisible();
					await expect(page.locator('div.calendar')).toHaveCount(0);
					await client`UPDATE settings SET pool_start='2099-01-01',pool_end='2099-01-28' WHERE id=1`;
					await page.goto('/calendar');
					await expect(
						page.getByRole('heading', { name: 'La prossima piscina inizia tra', exact: true })
					).toBeVisible();
					await expect(page.locator('.countdown')).toContainText('giorni');
					if (options.javaScriptEnabled) {
						await page.clock.install();
						const beforeTick = await page.locator('.countdown').textContent();
						await page.clock.fastForward(120000);
						await expect(page.locator('.countdown')).not.toHaveText(beforeTick!);
					}
					await expect(page.getByText(/Ehi, qui è tutto vuoto/)).toBeVisible();
					await expect(page.locator('div.calendar')).toHaveCount(0);
					const [event] =
						await client`INSERT INTO events(title,kind,week,weekday,start_time,end_time,compensation) VALUES ('Live recap','exam',1,1,'09:00','10:00',200) RETURNING id`;
					eventId = event.id;
					await client`INSERT INTO whitelist(login) VALUES (${login})`;
					const logsBefore =
						await client`SELECT * FROM action_logs WHERE actor_login=${login} AND action_type<>'LOGIN'`;
					const rejected = await page.request.post('/calendar?/register', {
						form: { id: String(event.id) },
						headers: { origin, accept: 'text/html' }
					});
					expect(rejected.status()).toBe(400);
					expect(await rejected.text()).toContain('La piscina non è ancora iniziata');
					expect(await client`SELECT * FROM registrations WHERE event_id=${event.id}`).toHaveLength(
						0
					);
					expect(
						await client`SELECT * FROM action_logs WHERE actor_login=${login} AND action_type<>'LOGIN'`
					).toEqual(logsBefore);
					const [pool] =
						await client`INSERT INTO pools(start_date,end_date,source,archived_at) VALUES ('2004-10-18','2004-11-14','site',now()) RETURNING id`;
					poolId = pool.id;
					const entries = [0, 7, 14, 21].map((day, i) => ({
						pool_id: pool.id,
						login,
						title: `Personal ${i}`,
						kind: ['exam', 'rush', 'cluster', 'exam'][i],
						event_date: new Date(Date.UTC(2004, 9, 18 + day)).toISOString().slice(0, 10),
						weekday: 1,
						start_time: '09:00',
						end_time: '10:00',
						duration_minutes: 60,
						compensation: 200,
						attended: true
					}));
					await client`INSERT INTO pool_entries ${client(entries)}`;
					await client`INSERT INTO pool_entries(pool_id,login,title,kind,event_date,duration_minutes,compensation,attended) VALUES (${pool.id},'secret_recap_other','Hidden other shift','exam','2004-10-19',60,100,true)`;
					await page.goto('/calendar');
					await page
						.getByRole('link', { name: 'Durante l’attesa, guarda cosa hai fatto', exact: true })
						.click();
					await expect(page).toHaveURL(`/recap/${pool.id}`);
					const recap = page.getByRole('region', { name: 'Il tuo riepilogo', exact: true });
					await expect(
						recap.getByRole('heading', { name: 'La tua piscina ottobre 2004', exact: true })
					).toBeVisible();
					const raw = await page.request.get(
						`/recap/${pool.id}/__data.json?login=secret_recap_other`
					);
					expect(await raw.text()).not.toContain('secret_recap_other');
					expect(await raw.text()).not.toContain('Hidden other shift');
					expect((await page.request.get(`/recap/${pool.id}?view=pool`)).status()).toBe(403);
					expect((await page.request.get('/recap/0x1')).status()).toBe(400);
					expect((await page.request.get('/recap/2147483647')).status()).toBe(404);
					if (options.javaScriptEnabled) {
						await expect(recap.locator('.screen:visible')).toHaveCount(1);
						await recap.getByRole('button', { name: 'Avanti', exact: true }).click();
						await expect(
							recap.getByRole('heading', { name: 'Il tuo turno preferito', exact: true })
						).toBeVisible();
						await recap.focus();
						await page.keyboard.press('ArrowRight');
						await expect(
							recap.getByRole('heading', { name: 'Il tuo ritmo', exact: true })
						).toBeVisible();
						await expect(
							recap.getByText('Settimana più intensa: 1', { exact: true })
						).toBeVisible();
						await expect(
							recap.getByRole('img', { name: 'Turni nelle settimane 1–4', exact: true })
						).toBeVisible();
						await page.keyboard.press('ArrowLeft');
						await expect(
							recap.getByRole('heading', { name: 'Il tuo turno preferito', exact: true })
						).toBeVisible();
						if (options.reducedMotion === 'reduce')
							expect(
								await recap
									.locator('.screen:visible')
									.evaluate((el) => getComputedStyle(el).animationName)
							).toBe('none');
						for (let i = 1; i < 7; i++)
							await recap.getByRole('button', { name: 'Avanti', exact: true }).click();
						await expect(recap.getByRole('heading', { name: /La piscina insieme/ })).toBeVisible();
					} else {
						await expect(recap.locator('.screen')).toHaveCount(8);
						await expect(recap.getByRole('navigation')).toHaveCount(0);
						await expect(
							recap.getByText('Settimana più intensa: 1', { exact: true })
						).toBeVisible();
					}
					await page.setViewportSize({ width: 360, height: 800 });
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
					).toBe(true);
					await page.goto('/profile');
					await page.getByRole('link', { name: 'ottobre 2004', exact: true }).click();
					await expect(page).toHaveURL(`/recap/${pool.id}`);
					const [csv] =
						await client`INSERT INTO pools(start_date,source,archived_at) VALUES ('2005-05-01','csv',now()) RETURNING id`;
					csvId = csv.id;
					await client`INSERT INTO pool_entries(pool_id,login,title,kind,duration_minutes,compensation,attended) VALUES (${csv.id},${login},'Imported','exam',90,200,true),(${csv.id},${login},'Absent','rush',60,0,false)`;
					await page.goto(`/recap/${csv.id}`);
					await expect(recap.locator('[data-screen=attendance]')).toHaveCount(0);
					await expect(recap.locator('[data-screen=rhythm]')).toHaveCount(0);
					await expect(recap.locator('[data-screen=first-last]')).toHaveCount(0);
					await expect(recap.locator('[data-screen=badges]')).toHaveCount(0);
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
					).toBe(true);
					await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
					await page.goto('/calendar');
					await expect(
						recap.getByRole('heading', { name: 'La tua piscina maggio 2005', exact: true })
					).toBeVisible();
					await client`UPDATE events SET event_date=null`;
					await client`UPDATE settings SET pool_start='2001-01-01',pool_end='2001-01-28' WHERE id=1`;
					await client`INSERT INTO registrations(event_id,participant_login) VALUES (${event.id},${login})`;
					await page.goto('/calendar');
					await expect(
						recap.getByRole('heading', { name: 'La tua piscina gennaio 2001', exact: true })
					).toBeVisible();
					await expect(page.locator('div.calendar')).toHaveCount(0);
					await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,pool_start='2000-01-03',pool_end='2099-12-31' WHERE id=1`;
					await page.goto('/calendar');
					await expect(recap).toHaveCount(0);
					await expect(page.locator('div.calendar')).toBeVisible();
					// The whole-pool link uses the same component, with no personal screens or names.
					const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
					await page.request.post('/auth/dev', {
						form: { mode: 'existing', userId: String(admin.id) },
						headers: { origin, accept: 'text/html' },
						maxRedirects: 0
					});
					await page.goto(`/admin/archive?year=2004&pool=${pool.id}`);
					await page.getByRole('link', { name: 'La piscina insieme', exact: true }).click();
					await expect(recap.locator('.screen')).toHaveCount(1);
					await expect(recap.getByRole('heading', { name: /La piscina insieme/ })).toBeVisible();
					await expect(recap).not.toContainText(login);
					await expect(recap).not.toContainText('secret_recap_other');
					await page.goto('/profile');
					expect(errors).toEqual([]);
				} finally {
					if (eventId) await client`DELETE FROM events WHERE id=${eventId}`;
					for (const row of savedEvents)
						await client`UPDATE events SET event_date=${row.event_date} WHERE id=${row.id}`;
					await client`DELETE FROM pools WHERE start_date='2001-01-01'`;
					for (const id of [poolId, csvId]) if (id) await client`DELETE FROM pools WHERE id=${id}`;
					await client`DELETE FROM whitelist WHERE login=${login}`;
					await client`DELETE FROM action_logs WHERE actor_login=${login}`;
					await client`DELETE FROM users WHERE login=${login}`;
					await client`UPDATE settings SET ${client(config, 'pool_start', 'pool_end', 'pool_closed_at', 'pool_reopened')} WHERE id=1`;
				}
			}
		);
	});
