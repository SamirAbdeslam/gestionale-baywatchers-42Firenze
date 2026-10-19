import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
const client = postgres(databaseUrl, { onnotice: () => {} });
test.afterAll(() => client.end());
async function login(request: APIRequestContext) {
	const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
	expect(
		(
			await request.post('/auth/dev', {
				form: { mode: 'existing', userId: String(admin.id) },
				headers: { origin: 'http://localhost:4173', accept: 'text/html' },
				maxRedirects: 0
			})
		).status()
	).toBe(303);
}
async function create(page: Page, title: string, kind = 'custom', weekday = '7') {
	const form = page.getByRole('region', { name: 'Crea evento', exact: true });
	await form.getByLabel('Tipo evento', { exact: true }).selectOption(kind);
	await form.getByLabel('Titolo', { exact: true }).fill(title);
	await form.getByLabel('Descrizione', { exact: true }).fill('descrizione custom');
	await form.getByLabel('Giorno', { exact: true }).selectOption(weekday);
	await form.getByLabel('Compenso (₳)', { exact: true }).fill('450');
	const response = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/admin?')
	);
	await form.getByRole('button', { name: 'Crea evento', exact: true }).click();
	await response;
}
async function submitDeletion(page: Page) {
	const response = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/admin?')
	);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Conferma eliminazione', exact: true })
		.click();
	expect((await response).status()).toBe(200);
}
async function confirm(page: Page, trigger: Locator, bulk = false) {
	await trigger.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	if (bulk) await dialog.getByRole('checkbox').check();
	await submitDeletion(page);
	await expect(dialog).not.toBeVisible();
}

test('admin creates, edits and deletes events with confirmation, counts and escaped user content', async ({
	page
}) => {
	const savedEvents = await client`SELECT * FROM events`;
	const savedRegistrations = await client`SELECT * FROM registrations`;
	const alerts: string[] = [];
	page.on('dialog', async (dialog) => {
		alerts.push(dialog.message());
		await dialog.dismiss();
	});
	try {
		await login(page.request);
		await page.goto('/admin?week=4');
		await page.evaluate(() => {
			document.documentElement.dataset.enhanced = 'yes';
		});
		const title = '<img src=x onerror=alert(1)> M4 custom';
		await page.getByLabel('Data specifica', { exact: true }).fill('2027-01-31');
		await create(page, title);
		let article = page.getByRole('article', { name: title, exact: true });
		await expect(article).toBeVisible();
		await expect(page.getByLabel('Settimana visualizzata')).toHaveValue('4');
		await expect(page.locator('html')).toHaveAttribute('data-enhanced', 'yes');
		await expect(article.locator('img')).toHaveCount(0);
		await page.getByRole('button', { name: 'Chiudi messaggio' }).click();
		await expect(page.getByRole('status')).toHaveCount(0);
		const [event] = await client`SELECT * FROM events WHERE title=${title}`;
		await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (${event.id},'m4_present',true),(${event.id},'m4_absent',false)`;
		await page.reload();
		await article.getByText('Modifica evento', { exact: true }).click();
		await article.getByLabel('Titolo', { exact: true }).fill('m4 modificato');
		await article.getByLabel('Giorno', { exact: true }).selectOption('1');
		await article.getByLabel('Posti', { exact: true }).fill('1');
		await article.getByRole('button', { name: 'Salva evento', exact: true }).click();
		article = page.getByRole('article', { name: 'M4 modificato', exact: true });
		await expect(article).toBeVisible();
		await expect(article).toContainText('Iscritti: 2 / 1');
		await expect(article).toContainText('Presenti: 1');
		await expect(article).toContainText('NON PARTECIPATO');
		await expect(article).toContainText('La capienza è inferiore');
		const viewport = page.viewportSize();
		await page.setViewportSize({ width: 360, height: 800 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		if (viewport) await page.setViewportSize(viewport);
		expect(
			(await client`SELECT week,kind,event_date::text FROM events WHERE id=${event.id}`)[0]
		).toMatchObject({ week: 4, kind: 'custom', event_date: '2027-01-31' });
		await article.getByRole('button', { name: 'Elimina evento', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Annulla' }).click();
		expect(await client`SELECT id FROM events WHERE id=${event.id}`).toHaveLength(1);
		await confirm(page, article.getByRole('button', { name: 'Elimina evento', exact: true }));
		await expect(article).toHaveCount(0);
		expect(await client`SELECT id FROM registrations WHERE event_id=${event.id}`).toHaveLength(0);
		await create(page, 'Ignored preset title', 'exam', '2');
		await expect(
			page.getByRole('article', { name: 'Sorveglianza esami (2 ore)', exact: true }).last()
		).toBeVisible();
		expect(
			(
				await client`SELECT compensation FROM events WHERE week=4 AND title='Sorveglianza esami (2 ore)' ORDER BY id DESC LIMIT 1`
			)[0].compensation
		).toBe(200);
		await expect(page.getByRole('button', { name: 'Chiudi messaggio' })).toHaveCount(0, {
			timeout: 8000
		});
		const otherWeeks = await client`SELECT id FROM events WHERE week<>4 ORDER BY id`;
		const tuesday = page.getByRole('region', { name: 'Martedì', exact: true });
		await tuesday.getByRole('button', { name: 'Elimina eventi del giorno', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Conferma eliminazione' }).click();
		expect(
			(await client`SELECT count(*)::int AS n FROM events WHERE week=4 AND weekday=2`)[0].n
		).toBeGreaterThan(0);
		await page.getByRole('dialog').getByRole('checkbox').check();
		await submitDeletion(page);
		await expect(page.getByRole('status')).toContainText('Eventi eliminati');
		expect(await client`SELECT id FROM events WHERE week=4 AND weekday=2`).toHaveLength(0);
		await confirm(
			page,
			page.getByRole('button', { name: 'Elimina eventi della settimana', exact: true }),
			true
		);
		await expect(page.getByRole('status')).toContainText('Eventi eliminati');
		expect(await client`SELECT id FROM events WHERE week=4`).toHaveLength(0);
		expect(await client`SELECT id FROM events WHERE week<>4 ORDER BY id`).toEqual(otherWeeks);
		await confirm(
			page,
			page.getByRole('button', { name: 'Elimina tutti gli eventi', exact: true }),
			true
		);
		await expect(page.getByRole('status')).toContainText('Eventi eliminati');
		expect(await client`SELECT * FROM events`).toHaveLength(0);
		expect(await client`SELECT * FROM registrations`).toHaveLength(0);
		expect(alerts).toEqual([]);
		await page.setViewportSize({ width: 360, height: 800 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	} finally {
		await client.begin(async (tx) => {
			await tx`DELETE FROM events`;
			if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
			if (savedRegistrations.length) await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
		});
	}
});

test('admin event forms and deletion confirmation work without JavaScript', async ({ browser }) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		baseURL: 'http://localhost:4173',
		viewport: { width: 360, height: 800 }
	});
	const page = await context.newPage();
	const title = `Nojs_${randomUUID().slice(0, 8)}`;
	try {
		await login(context.request);
		await page.goto('/admin?week=2');
		await create(page, '');
		await expect(page.getByRole('alert')).toContainText('Dati non validi');
		await create(page, title);
		const article = page.getByRole('article', { name: title, exact: true });
		await expect(article).toBeVisible();
		await expect(page.getByLabel('Settimana visualizzata')).toHaveValue('2');
		await article.getByText('Elimina evento', { exact: true }).click();
		await article.getByRole('button', { name: 'Conferma eliminazione', exact: true }).click();
		await expect(article).toHaveCount(0);
	} finally {
		await client`DELETE FROM events WHERE title=${title}`;
		await context.close();
	}
});
