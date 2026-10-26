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
async function setup() {
	const name = `m8_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
	const [settings] = await client`SELECT * FROM settings WHERE id=1`;
	const savedEvents = await client`SELECT * FROM events WHERE week=4`;
	const savedRegistrations =
		await client`SELECT r.* FROM registrations r JOIN events e ON r.event_id=e.id WHERE e.week=4`;
	await client`DELETE FROM events WHERE week=4`;
	await client`UPDATE settings SET display_week=4,active_week=1,pool_start='2098-12-15',pool_end='2099-01-11' WHERE id=1`;
	const title = '<img src=x onerror=alert(1)> ' + name;
	const [event] =
		await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots,compensation) VALUES (${title},4,1,'2099-01-05','09:00','11:00',3,200) RETURNING id`;
	await client`INSERT INTO registrations(event_id,participant_login,attended) VALUES (${event.id},${name + '_present'},true),(${event.id},${name + '_absent'},false)`;
	const [full] =
		await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${'Full ' + name},4,2,'2099-01-06','09:00','10:00',1) RETURNING id`;
	await client`INSERT INTO registrations(event_id,participant_login,attended) VALUES (${full.id},${name + '_full_absent'},false)`;
	await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time) VALUES (${'Past ' + name},4,3,'2000-01-05','09:00','10:00'),(${'Sunday ' + name},4,7,'2099-01-11','09:00','10:00')`;
	return {
		name,
		title,
		cleanup: async () => {
			await client.begin(async (tx) => {
				await tx`DELETE FROM events WHERE week=4`;
				if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
				if (savedRegistrations.length)
					await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
				await tx`UPDATE settings SET ${tx(settings, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
				await tx`DELETE FROM action_logs WHERE actor_login=${name}`;
				await tx`DELETE FROM users WHERE login=${name}`;
			});
		}
	};
}
async function login(request: APIRequestContext, name: string) {
	const response = await request.post('/auth/dev', {
		form: { mode: 'create', login: name, admin: 'on' },
		headers: { origin: 'http://localhost:4173', accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
}
for (const javaScriptEnabled of [true, false])
	test.describe(`display JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'shows a read-only public TV view with private absences and responsive columns',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const fixture = await setup();
				try {
					await page.goto('/display?week=1');
					await expect(
						page.getByRole('heading', { name: 'Settimana 4', exact: true })
					).toBeVisible();
					const article = page.getByRole('article', { name: fixture.title, exact: true });
					await expect(
						article.getByRole('heading', { name: fixture.title, exact: true, level: 3 })
					).toBeVisible();
					await expect(article).toContainText('1 posti liberi');
					await expect(article.locator('.seat.taken')).toHaveCount(2);
					await expect(article.locator('.seat')).toHaveCount(3);
					await expect(article).toContainText('₳ 200');
					await expect(article).toContainText('09:00–11:00');
					await expect(article).not.toContainText('5 Gen');
					await expect(page.getByRole('heading', { name: /Lunedì/, level: 2 })).toContainText(
						'5 Gen'
					);
					await expect(article).toContainText(fixture.name + '_present');
					expect(await page.content()).not.toContain(fixture.name + '_absent');
					expect(await page.content()).not.toContain(fixture.name + '_full_absent');
					await expect(article.locator('img')).toHaveCount(0);
					await expect(
						page.getByRole('article', { name: 'Full ' + fixture.name, exact: true })
					).toContainText('Turno pieno');
					await expect(
						page.getByRole('article', { name: 'Past ' + fixture.name, exact: true })
					).toContainText('Concluso');
					await expect(page.getByRole('heading', { name: /Domenica/ })).toHaveCount(1);
					await expect(page.getByRole('heading', { name: /Sabato/ })).toHaveCount(0);
					await expect(page.locator('header, nav, form, button, a')).toHaveCount(0);
					for (const width of [360, 768, 1280]) {
						await page.setViewportSize({ width, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
					const positions = await page
						.locator('.display-grid > section')
						.evaluateAll((sections) =>
							sections.map((section) => section.getBoundingClientRect().top)
						);
					expect(new Set(positions).size).toBe(1);
					// The same restrictions apply to authenticated administrators.
					await login(page.request, fixture.name);
					await page.goto('/admin');
					await expect(page.getByLabel('Link display per la TV')).toHaveValue(
						'http://localhost:4173/display'
					);
					await expect(page.getByLabel('Link display per la TV')).toHaveAttribute('readonly', '');
					await page.goto('/display');
					await expect(page.locator('header, nav, form, button, a')).toHaveCount(0);
					expect(await page.content()).not.toContain(fixture.name + '_absent');
				} finally {
					await fixture.cleanup();
				}
			}
		);
		test(
			'redirects using a native meta refresh with or without JavaScript',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const fixture = await setup();
				try {
					await page.goto('/display');
					await expect(page.locator('meta[http-equiv="refresh"]')).toHaveAttribute(
						'content',
						'8; url=http://localhost:4173/healthz'
					);
					await expect(page).toHaveURL('http://localhost:4173/healthz', { timeout: 15000 });
				} finally {
					await fixture.cleanup();
				}
			}
		);
	});
