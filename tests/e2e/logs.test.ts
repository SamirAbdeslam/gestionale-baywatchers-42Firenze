import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { expect, test, type Page } from '@playwright/test';
const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function setup(page: Page) {
	const base = 'm13_' + randomUUID().slice(0, 8);
	const saved = await client`SELECT * FROM action_logs`;
	expect(
		(
			await page.request.post('/auth/dev', {
				form: { mode: 'create', login: base, admin: 'on' },
				headers: { origin, accept: 'text/html' },
				maxRedirects: 0
			})
		).status()
	).toBe(303);
	await client`DELETE FROM action_logs`;
	await client`INSERT INTO action_logs(created_at,actor_login,action_type,description) SELECT '2020-01-03T12:00:00Z'::timestamptz,CASE WHEN i<53 THEN ${base + '_one'} ELSE ${base + '_two'} END,CASE WHEN i<53 THEN 'CREATE_EVENT' ELSE 'LOGIN' END,CASE WHEN i=0 THEN '=1+1' ELSE 'Riga '||i END FROM generate_series(0,55) i`;
	const danger = '<img src=x onerror=alert(1)> ' + base;
	const [row] =
		await client`INSERT INTO action_logs(created_at,actor_login,action_type,description,ip_address,user_agent,resource_id,resource_type,old_value,new_value) VALUES('2020-01-03T13:00:00Z',${base + '_one'},'CREATE_EVENT',${danger},'127.0.0.1',${danger},'42','event',${client.json({ title: danger })},${client.json({ title: 'Dopo' })}) RETURNING id`;
	return {
		base,
		danger,
		id: row.id as number,
		cleanup: async () => {
			await page.close();
			await client.begin(async (tx) => {
				await tx`DELETE FROM events WHERE title=${danger}`;
				await tx`DELETE FROM whitelist WHERE login IN (${base + '_allow1'},${base + '_allow2'})`;
				await tx`DELETE FROM action_logs`;
				if (saved.length) await tx`INSERT INTO action_logs ${tx(saved)}`;
				await tx`DELETE FROM users WHERE login=${base}`;
			});
		}
	};
}
for (const javaScriptEnabled of [true, false])
	test.describe(`logs JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'filters and paginates audit, opens safe details and exports every matching row',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const fixture = await setup(page);
				let alerts = 0;
				page.on('dialog', async (dialog) => {
					alerts++;
					await dialog.dismiss();
				});
				try {
					await page.goto('/admin/logs');
					const rows = page.locator('tbody > tr');
					await expect(rows).toHaveCount(50);
					await expect(page.getByText('Pagina 1 di 2', { exact: true })).toBeVisible();
					await expect(rows.first().getByRole('cell').nth(3)).toHaveText(fixture.danger);
					await rows.first().getByRole('button', { name: 'Dettagli', exact: true }).click();
					const dialog = page.getByRole('dialog', {
						name: `Dettagli log #${fixture.id.toLocaleString('it')}`
					});
					await expect(dialog).toBeVisible();
					await expect(dialog).toContainText(fixture.danger);
					await expect(dialog).toContainText('127.0.0.1');
					await expect(dialog.locator('dd').nth(7)).toHaveText(fixture.danger);
					await expect(dialog.locator('img')).toHaveCount(0);
					await expect(rows.locator('img')).toHaveCount(0);
					await expect(dialog).toContainText('42');
					await expect(dialog.locator('pre').first()).toHaveText(
						JSON.stringify({ title: fixture.danger }, null, 2)
					);
					await expect(dialog.locator('pre').nth(1)).toHaveText(
						JSON.stringify({ title: 'Dopo' }, null, 2)
					);
					await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
					await expect(dialog).toBeHidden();
					const downloading = page.waitForEvent('download');
					await page.getByRole('link', { name: 'Esporta CSV', exact: true }).click();
					const download = await downloading;
					expect(download.suggestedFilename()).toBe('action_logs.csv');
					const csv = readFileSync((await download.path())!, 'utf8');
					expect(csv.split('\r\n')).toHaveLength(59);
					expect(csv).toContain("'=1+1");
					expect(csv).toContain(fixture.danger);
					await page.getByRole('link', { name: 'Successiva', exact: true }).click();
					await expect(rows).toHaveCount(7);
					await expect(page.getByText('Pagina 2 di 2', { exact: true })).toBeVisible();
					await page.getByLabel('Data', { exact: true }).fill('2020-01-03');
					await expect(page.getByLabel('Utente', { exact: true }).locator('option')).toHaveText([
						'Tutti gli utenti',
						fixture.base + '_one',
						fixture.base + '_two'
					]);
					await page.getByLabel('Utente', { exact: true }).selectOption(fixture.base + '_one');
					await page.getByLabel('Tipo azione', { exact: true }).selectOption('CREATE_EVENT');
					await page.getByRole('button', { name: 'Filtra', exact: true }).click();
					await expect(page.getByText('Mostrati 50 di 54 log', { exact: true })).toBeVisible();
					expect(new URL(page.url()).searchParams.has('page')).toBe(false);
					await page.getByRole('link', { name: 'Successiva', exact: true }).click();
					await expect(rows).toHaveCount(4);
					const url = new URL(page.url());
					expect(url.searchParams.get('user')).toBe(fixture.base + '_one');
					expect(url.searchParams.get('date')).toBe('2020-01-03');
					expect(url.searchParams.get('action')).toBe('CREATE_EVENT');
					const filtered = await page.request.get(
						(await page
							.getByRole('link', { name: 'Esporta CSV', exact: true })
							.getAttribute('href'))!
					);
					expect((await filtered.text()).split('\r\n')).toHaveLength(56);
					await page.getByLabel('Data', { exact: true }).fill('2050-01-01');
					await page.getByRole('button', { name: 'Filtra', exact: true }).click();
					await expect(
						page.getByText('Nessun log trovato con i filtri correnti', { exact: true })
					).toBeVisible();
					await expect(page.getByLabel('Utente', { exact: true }).locator('option')).toHaveCount(3);
					await page.getByRole('link', { name: 'Azzera filtri', exact: true }).click();
					await expect(rows).toHaveCount(50);
					await page.setViewportSize({ width: 360, height: 800 });
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
					).toBe(true);
					expect(alerts).toBe(0);
					expect((await client`SELECT count(*)::int AS n FROM action_logs`)[0].n).toBe(57);
				} finally {
					await fixture.cleanup();
				}
			}
		);
	});
async function live(page: Page, path: string) {
	const connected = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/stream' && response.status() === 200
	);
	await page.goto(path);
	await connected;
}
test(
	'inserts and highlights live logs safely or shows a refresh banner on filtered and later pages',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const fixture = await setup(page);
		let alerts = 0;
		page.on('dialog', async (dialog) => {
			alerts++;
			await dialog.dismiss();
		});
		try {
			await client`UPDATE action_logs SET created_at='2020-01-04T12:00:00Z' WHERE id=${fixture.id}`;
			await client`INSERT INTO action_logs(created_at,actor_login,action_type,description) VALUES('2020-01-03T14:00:00Z',${fixture.base},'LOGIN','ID maggiore, data precedente')`;
			await live(page, '/admin/logs');
			await page.evaluate(() => {
				document.documentElement.dataset.m13Document = 'same';
			});
			expect(
				(
					await page.request.post('/admin?/createEvent', {
						form: {
							kind: 'custom',
							title: fixture.danger,
							description: 'Prova',
							week: '1',
							weekday: '1',
							eventDate: '2099-01-05',
							startTime: '09:00',
							endTime: '10:00',
							maxSlots: '2',
							compensation: '5'
						},
						headers: { origin, 'user-agent': fixture.danger },
						maxRedirects: 0
					})
				).status()
			).toBe(200);
			const first = page.locator('tbody > tr').first();
			await expect(first.getByRole('cell').nth(3)).toContainText(fixture.danger);
			await expect(first).toHaveClass(/\bnew\b/);
			await expect(page.locator('tbody > tr.new')).toHaveCount(1);
			await expect(page.locator('html')).toHaveAttribute('data-m13-document', 'same');
			await expect(
				page.getByRole('button', { name: 'Nuovi log disponibili', exact: true })
			).toHaveCount(0);
			await first.getByRole('button', { name: 'Dettagli', exact: true }).click();
			await expect(page.getByRole('dialog')).toContainText(fixture.danger);
			await expect(page.getByRole('dialog').locator('dd').nth(7)).toHaveText(fixture.danger);
			await expect(page.getByRole('dialog').locator('img')).toHaveCount(0);
			await page.getByRole('dialog').getByRole('button', { name: 'Annulla', exact: true }).click();
			for (const [index, path] of [
				'/admin/logs?page=2',
				'/admin/logs?user=' + fixture.base + '_two'
			].entries()) {
				await live(page, path);
				const before = await page.locator('tbody').innerText();
				let refreshes = 0;
				const listener = (request: import('@playwright/test').Request) => {
					if (new URL(request.url()).pathname === '/admin/logs/__data.json') refreshes++;
				};
				page.on('request', listener);
				expect(
					(
						await page.request.post('/admin/whitelist?/add', {
							form: { logins: fixture.base + '_allow' + (index + 1) },
							headers: { origin },
							maxRedirects: 0
						})
					).status()
				).toBe(200);
				const banner = page.getByRole('button', { name: 'Nuovi log disponibili', exact: true });
				await expect(banner).toBeVisible();
				expect(refreshes).toBe(0);
				expect(await page.locator('tbody').innerText()).toBe(before);
				await banner.click();
				await expect(banner).toHaveCount(0);
				expect(refreshes).toBe(1);
				await expect(page).toHaveURL(path);
				page.off('request', listener);
			}
			expect(alerts).toBe(0);
		} finally {
			await fixture.cleanup();
		}
	}
);
