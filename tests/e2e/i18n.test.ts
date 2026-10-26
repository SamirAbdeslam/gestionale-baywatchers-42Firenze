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

test('the language route accepts known locales and same-site paths only', async ({ request }) => {
	expect((await request.get('/language/de', { maxRedirects: 0 })).status()).toBe(404);
	for (const [to, location] of [
		['/calendar?week=2', '/calendar?week=2'],
		['//evil.example', '/'],
		['/\\evil.example', '/'],
		['https://evil.example', '/']
	]) {
		const response = await request.get(`/language/fr?to=${encodeURIComponent(to)}`, {
			maxRedirects: 0
		});
		expect(response.status()).toBe(303);
		expect(response.headers()['location']).toBe(location);
		expect(response.headers()['set-cookie']).toMatch(/^PARAGLIDE_LOCALE=fr;/);
	}
});

const flows = [
	{
		locale: 'en',
		language: 'English',
		week: 'Week 2',
		monday: /Monday/,
		register: 'Take the shift',
		taken: 'The shift is yours'
	},
	{
		locale: 'fr',
		language: 'Français',
		week: 'Semaine 2',
		monday: /Lundi/,
		register: 'Je prends le créneau',
		taken: 'Le créneau est à toi'
	}
] as const;
for (const javaScriptEnabled of [true, false])
	test.describe(`languages with JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		for (const flow of flows)
			test(
				`switches to ${flow.locale} and takes a shift`,
				{ tag: '@shared-db' },
				async ({ page }) => {
					const name = `i18n_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
					const [settings] = await client`SELECT * FROM settings WHERE id=1`;
					const title = `I18n ${name}`;
					try {
						await client`UPDATE settings SET active_week=2,max_events_per_user=0 WHERE id=1`;
						await client`INSERT INTO whitelist(login) VALUES (${name})`;
						await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots,compensation) VALUES (${title},2,1,'2099-01-05','09:00','11:00',3,200)`;
						await page.goto('/');
						await page.getByRole('button', { name: /^Lingua IT$/ }).click();
						await page
							.getByRole('navigation', { name: 'Lingua', exact: true })
							.getByRole('link', { name: flow.language, exact: true })
							.click();
						await expect(page).toHaveURL('/');
						await expect(page.locator('html')).toHaveAttribute('lang', flow.locale);
						const login = await page.request.post('/auth/dev', {
							form: { mode: 'create', login: name },
							headers: { origin, accept: 'text/html' },
							maxRedirects: 0
						});
						expect(login.status()).toBe(303);
						await page.goto('/calendar');
						await expect(page.getByRole('heading', { name: flow.week, exact: true })).toBeVisible();
						await expect(page.getByRole('heading', { name: flow.monday, level: 2 })).toHaveCount(1);
						const article = page
							.locator('.calendar')
							.getByRole('article', { name: title, exact: true });
						await article.getByRole('button', { name: flow.register, exact: true }).click();
						await expect(page.getByRole('dialog', { name: flow.taken, exact: true })).toBeVisible();
						await expect
							.poll(
								async () =>
									(
										await client`SELECT r.id FROM registrations r JOIN events e ON r.event_id=e.id WHERE e.title=${title} AND r.participant_login=${name}`
									).length
							)
							.toBe(1);
					} finally {
						await client.begin(async (tx) => {
							await tx`DELETE FROM events WHERE title=${title}`;
							await tx`UPDATE settings SET ${tx(settings, 'active_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
							await tx`DELETE FROM action_logs WHERE actor_login=${name}`;
							await tx`DELETE FROM whitelist WHERE login=${name}`;
							await tx`DELETE FROM users WHERE login=${name}`;
						});
					}
				}
			);
	});
