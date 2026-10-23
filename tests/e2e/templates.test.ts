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
const origin = 'http://localhost:4173';
for (const javaScriptEnabled of [true, false]) {
	test.describe(`templates JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'adds two rows, removes one, preserves invalid values, saves, applies and imports CSV',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const name = `M10_${randomUUID().slice(0, 8)}`;
				const login = name.toLowerCase();
				const savedEvents = await client`SELECT * FROM events`;
				const savedRegistrations = await client`SELECT * FROM registrations`;
				const oldTemplates = await client`SELECT id FROM week_templates`;
				await page.request.post('/auth/dev', {
					form: { mode: 'create', login, admin: 'on' },
					headers: { origin, accept: 'text/html' },
					maxRedirects: 0
				});
				try {
					await page.goto('/admin/templates/new');
					const cookies = await page.context().cookies();
					const before = await client`SELECT id FROM week_templates ORDER BY id`;
					let posts = 0;
					page.on('request', (request) => {
						if (request.method() === 'POST' && request.url().includes('/admin/templates/new'))
							posts++;
					});
					await page.getByLabel('Nome template', { exact: true }).fill(name);
					await page
						.getByLabel('Descrizione template', { exact: true })
						.fill('Descrizione conservata');
					await page.getByLabel('Settimana target', { exact: true }).selectOption('4');
					await page.getByRole('button', { name: 'Aggiungi riga', exact: true }).click();
					const first = page.getByRole('group', { name: 'Evento 1', exact: true });
					await expect(first).toBeVisible();
					if (javaScriptEnabled)
						await first.getByText('Giorno, data e descrizione', { exact: true }).click();
					await first.getByLabel('Titolo', { exact: true }).fill(name + ' evento');
					await first
						.getByLabel('Descrizione evento', { exact: true })
						.fill('Descrizione evento conservata');
					await first.getByLabel('Giorno', { exact: true }).selectOption('7');
					await first.getByLabel('Data facoltativa', { exact: true }).fill('2027-01-31');
					await first.getByLabel('Inizio', { exact: true }).fill('11:00');
					await first.getByLabel('Fine', { exact: true }).fill('12:00');
					await first.getByLabel('Posti', { exact: true }).fill('3');
					await first.getByLabel('Compenso', { exact: true }).fill('450');
					await page.getByRole('button', { name: 'Aggiungi riga', exact: true }).click();
					const second = page.getByRole('group', { name: 'Evento 2', exact: true });
					await second.getByLabel('Titolo', { exact: true }).fill('Da rimuovere');
					await second.getByRole('button', { name: 'Rimuovi', exact: true }).click();
					await expect(second).toHaveCount(0);
					expect(posts).toBe(javaScriptEnabled ? 0 : 3);
					expect(await client`SELECT id FROM week_templates ORDER BY id`).toEqual(before);
					expect(
						await client`SELECT id FROM action_logs WHERE actor_login=${login} AND action_type<>'LOGIN'`
					).toHaveLength(0);
					const afterCookies = await page.context().cookies();
					expect(
						afterCookies.every((cookie) => ['session', 'PARAGLIDE_LOCALE'].includes(cookie.name))
					).toBe(true);
					expect(afterCookies.find((cookie) => cookie.name === 'session')?.value).toBe(
						cookies.find((cookie) => cookie.name === 'session')?.value
					);
					await first.getByLabel('Compenso', { exact: true }).fill('-1');
					await page.getByRole('button', { name: 'Salva template', exact: true }).click();
					await expect(page.getByRole('alert')).toContainText('Dati non validi');
					await expect(page.getByLabel('Nome template', { exact: true })).toHaveValue(name);
					await expect(page.getByLabel('Descrizione template', { exact: true })).toHaveValue(
						'Descrizione conservata'
					);
					await expect(page.getByLabel('Settimana target', { exact: true })).toHaveValue('4');
					for (const [label, value] of Object.entries({
						Titolo: name + ' evento',
						'Descrizione evento': 'Descrizione evento conservata',
						Giorno: '7',
						'Data facoltativa': '2027-01-31',
						Inizio: '11:00',
						Fine: '12:00',
						Posti: '3',
						Compenso: '-1'
					}))
						await expect(first.getByLabel(label, { exact: true })).toHaveValue(value);
					expect(await client`SELECT id FROM week_templates ORDER BY id`).toEqual(before);
					await first.getByLabel('Compenso', { exact: true }).fill('450');
					await page.getByRole('button', { name: 'Salva template', exact: true }).click();
					await expect(page.getByRole('status')).toContainText(
						`Template "${name}" creato con successo con 1 eventi`
					);
					await page.getByRole('link', { name: 'Elenco template', exact: true }).click();
					const article = page.getByRole('article', { name, exact: true });
					await expect(article).toContainText('1 eventi');
					await article.getByRole('button', { name: /^Applica template W/ }).click();
					await expect(page.getByRole('status')).toContainText('Esistono già');
					await article.getByRole('checkbox', { name: 'Sovrascrivi', exact: true }).check();
					await article.getByRole('button', { name: /^Applica template W/ }).click();
					await expect(page.getByRole('status')).toContainText(`Template "${name}" applicato!`);
					await page.getByRole('link', { name: 'Visualizza settimana 4', exact: true }).click();
					await expect(page).toHaveURL('/admin?week=4');
					await expect(
						page.getByRole('article', { name: name + ' evento', exact: true })
					).toContainText('450');
					expect(
						(await client`SELECT event_date FROM events WHERE title=${name + ' evento'}`)[0]
							.event_date
					).toBe(null);
					await page.goto('/admin/templates');
					const csv = await page.request.get('/admin/templates/example.csv');
					expect(csv.headers()['content-disposition']).toContain('template_esempio.csv');
					expect(await csv.text()).toBe('Week,Giorno,Orario,Tipo Evento,Compenso,Partecipanti\n');
					await page.getByLabel('File CSV (massimo 1 MB e 2000 righe)').setInputFiles({
						name: 'import.csv',
						mimeType: 'text/csv',
						buffer: await readFile('tests/fixtures/import.csv')
					});
					await page.getByRole('button', { name: 'Importa CSV', exact: true }).click();
					await expect(
						page.getByRole('status').filter({ hasText: 'Import completato!' })
					).toContainText('Creati 2 template con 2 eventi totali');
					await expect(page.getByRole('status').filter({ hasText: 'Saltate' })).toContainText(
						'Saltate 1 righe'
					);
					await article.getByRole('button', { name: 'Elimina template', exact: true }).click();
					await page
						.getByRole('dialog')
						.getByRole('button', { name: 'Elimina template', exact: true })
						.click();
					await expect(article).toHaveCount(0);
					expect(
						(
							await client`SELECT action_type FROM action_logs WHERE actor_login=${login} AND action_type<>'LOGIN' ORDER BY id`
						).map((row) => row.action_type)
					).toEqual(['CREATE_TEMPLATE', 'APPLY_TEMPLATE', 'IMPORT_TEMPLATES', 'DELETE_TEMPLATE']);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
				} finally {
					await page.goto('/');
					await client.begin(async (tx) => {
						await tx`DELETE FROM events`;
						if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
						if (savedRegistrations.length)
							await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
						await tx`DELETE FROM week_templates WHERE NOT (id=ANY(${oldTemplates.map((row) => row.id as number)}::int[]))`;
						await tx`DELETE FROM action_logs WHERE actor_login=${login}`;
						await tx`DELETE FROM users WHERE login=${login}`;
					});
				}
			}
		);
	});
}
