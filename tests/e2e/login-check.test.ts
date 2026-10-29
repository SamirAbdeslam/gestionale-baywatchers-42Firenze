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
	test.describe(`add participant with JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'rejects logins outside the whitelist and accepts whitelisted ones on a full event',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const name = `lc_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
				const listed = `${name}_ok`,
					typo = `${name}_typo`;
				const title = `LC ${name}`;
				await client`INSERT INTO whitelist (login) VALUES (${listed})`;
				const [event] =
					await client`INSERT INTO events (title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${title},4,1,'2099-01-01','09:00','10:00',1) RETURNING id`;
				await client`INSERT INTO registrations (event_id,participant_login) VALUES (${event.id},${`${name}_first`})`;
				try {
					const response = await page.request.post('/auth/dev', {
						form: { mode: 'create', login: name, admin: 'on' },
						headers: { origin, accept: 'text/html' },
						maxRedirects: 0
					});
					expect(response.status()).toBe(303);
					await page.goto('/admin?week=4');
					const article = page.getByRole('article', { name: title, exact: true });
					const add = article.getByRole('button', { name: 'Aggiungi partecipante', exact: true });
					await article.getByLabel('Login del partecipante').fill(typo);
					await add.click();
					await expect(
						page.getByRole('alert').filter({
							hasText: `Il login ${typo} non è in whitelist: aggiungilo prima dalla pagina Whitelist`
						})
					).toBeVisible();
					expect(
						await client`SELECT id FROM registrations WHERE participant_login=${typo}`
					).toHaveLength(0);
					await article.getByLabel('Login del partecipante').fill(listed);
					await add.click();
					await expect(article.getByRole('listitem').filter({ hasText: listed })).toBeVisible();
					await expect(article).toContainText('2/1');
				} finally {
					await client`DELETE FROM events WHERE id=${event.id}`;
					await client`DELETE FROM whitelist WHERE login=${listed}`;
					await client`DELETE FROM action_logs WHERE actor_login=${name}`;
					await client`DELETE FROM users WHERE login=${name}`;
				}
			}
		);
	});
}

test(
	'suggests whitelisted logins with initials, works by keyboard, mouse and ARIA, and serves avatars to admins only',
	{ tag: '@shared-db' },
	async ({ page, browser }) => {
		const name = `lc_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
		const first = `${name}_aa`,
			second = `${name}_ab`,
			stranger = `${name}_zz`;
		const title = `LC ${name}`;
		await client`INSERT INTO whitelist (login) VALUES (${first}),(${second})`;
		await client`INSERT INTO users (intra_id, login, display_name, role) VALUES (${Math.floor(Math.random() * 1e9) + 1e9}, ${first}, 'Anna Alfa', 'user')`;
		const [event] =
			await client`INSERT INTO events (title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${title},4,1,'2099-01-01','09:00','10:00',5) RETURNING id`;
		try {
			const response = await page.request.post('/auth/dev', {
				form: { mode: 'create', login: name, admin: 'on' },
				headers: { origin, accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status()).toBe(303);
			await page.goto('/admin?week=4');
			const article = page.getByRole('article', { name: title, exact: true });
			const input = article.getByRole('combobox', { name: 'Login del partecipante' });
			await expect(input).toHaveAttribute('aria-expanded', 'false');
			await input.pressSequentially(`${name}_a`);
			const options = article.getByRole('option');
			await expect(options).toHaveCount(2);
			await expect(input).toHaveAttribute('aria-expanded', 'true');
			await expect(options.first()).toContainText(`${first}`);
			await expect(options.first()).toContainText('Anna Alfa');
			await expect(options.first()).toContainText('AA');
			await input.press('ArrowDown');
			await input.press('ArrowDown');
			await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
			await expect(input).toHaveAttribute(
				'aria-activedescendant',
				(await options.nth(1).getAttribute('id'))!
			);
			await input.press('Escape');
			await expect(options).toHaveCount(0);
			await input.press('ArrowDown');
			await input.press('ArrowDown');
			await input.press('Enter');
			await expect(input).toHaveValue(second);
			await expect(article.getByRole('listitem').filter({ hasText: second })).toHaveCount(0);
			await input.fill('');
			await input.pressSequentially(`${name}_a`);
			await options.first().click();
			await expect(input).toHaveValue(first);
			await input.fill(stranger);
			await expect(options).toHaveCount(0);

			const admin = await page.request.get(`/avatar/${second}`);
			expect(admin.status()).toBe(404); // whitelisted but never logged in: no stored image
			expect((await page.request.get(`/avatar/${stranger}`)).status()).toBe(404);
			const json = await (await page.request.get(`/admin/logins?q=${name}_a`)).json();
			expect(json.map((row: { login: string }) => row.login)).toEqual([first, second]);

			const context = await browser.newContext();
			try {
				const student = await context.request.post('/auth/dev', {
					form: { mode: 'create', login: `${name}_stu` },
					headers: { origin, accept: 'text/html' },
					maxRedirects: 0
				});
				expect(student.status()).toBe(303);
				expect((await context.request.get(`/admin/logins?q=${name}`)).status()).toBe(403);
				expect((await context.request.get(`/avatar/${first}`)).status()).toBe(404);
			} finally {
				await context.close();
			}
		} finally {
			await client`DELETE FROM events WHERE id=${event.id}`;
			await client`DELETE FROM whitelist WHERE login IN (${first},${second})`;
			await client`DELETE FROM action_logs WHERE actor_login=${name}`;
			await client`DELETE FROM users WHERE login IN (${name},${first},${`${name}_stu`})`;
		}
	}
);
