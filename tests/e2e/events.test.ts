import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type APIRequestContext, type Page, type Locator } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
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
async function openCreate(page: Page) {
	const dialog = page.getByRole('dialog', { name: 'Crea evento', exact: true });
	if (!(await dialog.isVisible()))
		await page.getByRole('button', { name: 'Crea evento', exact: true }).first().click();
	await expect(dialog).toBeVisible();
	return dialog;
}
async function create(page: Page, title: string, kind = 'custom', weekday = '7') {
	const form = await openCreate(page);
	await form.locator(`input[type=radio][name=kind][value=${kind}]`).check();
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

test(
	'admin creates, edits and deletes events with confirmation, counts and escaped user content',
	{ tag: '@shared-db' },
	async ({ page }) => {
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
			await (
				await openCreate(page)
			)
				.getByLabel('Data specifica', { exact: true })
				.fill('2027-01-31');
			await create(page, title);
			let article = page.getByRole('article', { name: title, exact: true });
			await expect(article).toBeVisible();
			await expect(
				page
					.getByRole('navigation', { name: 'Settimana visualizzata' })
					.getByRole('link', { name: 'W04', exact: true })
			).toHaveAttribute('aria-current', 'page');
			await expect(page.locator('html')).toHaveAttribute('data-enhanced', 'yes');
			await expect(article.locator('img')).toHaveCount(0);
			await page.getByRole('button', { name: 'Chiudi messaggio' }).click();
			await expect(page.getByRole('status')).toHaveCount(0);
			const [event] = await client`SELECT * FROM events WHERE title=${title}`;
			await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (${event.id},'m4_present',true),(${event.id},'m4_absent',false)`;
			await page.reload();
			await article.getByRole('button', { name: 'Modifica evento', exact: true }).click();
			const editor = page.getByRole('dialog', { name: 'Modifica evento', exact: true });
			await editor.getByLabel('Titolo', { exact: true }).fill('m4 modificato');
			await editor.getByLabel('Giorno', { exact: true }).selectOption('1');
			await editor.getByLabel('Posti', { exact: true }).fill('1');
			await editor.getByRole('button', { name: 'Salva evento', exact: true }).click();
			await expect(page.getByRole('alert')).toContainText(
				'La data specifica non corrisponde al giorno della settimana'
			);
			await article.getByRole('button', { name: 'Modifica evento', exact: true }).click();
			await expect(editor.getByLabel('Titolo', { exact: true })).toHaveValue('m4 modificato');
			await editor.getByLabel('Giorno', { exact: true }).selectOption('7');
			await editor.getByRole('button', { name: 'Salva evento', exact: true }).click();
			article = page.getByRole('article', { name: 'M4 modificato', exact: true });
			await expect(article).toBeVisible();
			await expect(article).toContainText('2/1');
			await expect(article).toContainText('Presenti: 1');
			await expect(article.locator('.participant.absent')).toHaveCount(1);
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
			const tuesday = page.getByRole('group', { name: 'Martedì', exact: true });
			await tuesday.getByRole('button', { name: 'Crea evento per Martedì', exact: true }).click();
			await expect(
				page
					.getByRole('dialog', { name: 'Crea evento', exact: true })
					.getByLabel('Giorno', { exact: true })
			).toHaveValue('2');
			await page.getByRole('dialog').getByRole('button', { name: 'Annulla', exact: true }).click();
			await tuesday.getByRole('button', { name: 'Elimina eventi di Martedì', exact: true }).click();
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
				if (savedRegistrations.length)
					await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
			});
		}
	}
);

test(
	'admin event forms and deletion confirmation work without JavaScript',
	{ tag: '@shared-db' },
	async ({ browser }) => {
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
			await page
				.getByRole('alert')
				.getByRole('button', { name: 'Chiudi messaggio', exact: true })
				.click();
			await expect(page.getByRole('alert')).toHaveCount(0);
			await expect(page.locator('.notices .notice')).not.toBeVisible();
			await expect(page.locator('.notices summary')).not.toBeVisible();
			await create(page, title);
			const article = page.getByRole('article', { name: title, exact: true });
			await expect(article).toBeVisible();
			await expect(
				page
					.getByRole('navigation', { name: 'Settimana visualizzata' })
					.getByRole('link', { name: 'W02', exact: true })
			).toHaveAttribute('aria-current', 'page');
			await page
				.getByRole('button', { name: 'Elimina eventi della settimana', exact: true })
				.click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.getByRole('dialog').getByRole('checkbox').check();
			await page.getByRole('dialog').getByRole('button', { name: 'Annulla', exact: true }).click();
			await expect(page.getByRole('dialog')).not.toBeVisible();
			await article.getByRole('button', { name: 'Elimina evento', exact: true }).click();
			await page.getByRole('dialog').getByRole('button', { name: 'Annulla', exact: true }).click();
			await expect(page.getByRole('dialog')).not.toBeVisible();
			await article.getByRole('button', { name: 'Elimina evento', exact: true }).click();
			await page
				.getByRole('dialog')
				.getByRole('button', { name: 'Conferma eliminazione', exact: true })
				.click();
			await expect(article).toHaveCount(0);
		} finally {
			await client`DELETE FROM events WHERE title=${title}`;
			await context.close();
		}
	}
);

test(
	'keeps errors and warnings after seven seconds while successes expire',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const title = `toast_${randomUUID().slice(0, 8)}`;
		try {
			await login(page.request);
			await page.clock.install();
			await page.goto('/admin?week=4');
			await create(page, '');
			const alert = page.getByRole('alert');
			await expect(alert).toContainText('Dati non validi');
			await page.clock.fastForward(7000);
			await expect(alert).toBeVisible();
			await alert.getByRole('button', { name: 'Chiudi messaggio', exact: true }).click();
			await expect(alert).toHaveCount(0);

			await page.goto('/admin/whitelist');
			await page.getByLabel('Login da aggiungere').fill('dev_admin');
			await page.getByRole('button', { name: 'Aggiungi alla whitelist', exact: true }).click();
			const warning = page.getByRole('status').filter({ hasText: 'Già presenti:' });
			await expect(warning).toBeVisible();
			await page.clock.fastForward(7000);
			await expect(warning).toBeVisible();

			await page.getByLabel('Login da aggiungere').fill(`dev_admin ${title}`);
			await page.getByRole('button', { name: 'Aggiungi alla whitelist', exact: true }).click();
			const success = page.getByRole('status').filter({ hasText: 'Aggiunti alla whitelist:' });
			await expect(success).toBeVisible();
			await expect(warning).toBeVisible();
			await page.clock.fastForward(4000);
			await expect(success).toHaveCount(0);
			await expect(warning).toBeVisible();

			await page.goto('/admin?week=4');
			await expect(page.getByRole('status')).toHaveCount(0);
			await create(page, title);
			await expect(page.getByRole('status')).toContainText('Evento creato');
			await page.clock.fastForward(3000);
			await expect(page.getByRole('status')).toContainText('Evento creato');
			await page.clock.fastForward(1000);
			await expect(page.getByRole('status')).toHaveCount(0);
		} finally {
			await client`DELETE FROM action_logs WHERE resource_type='event' AND resource_id IN (SELECT id::text FROM events WHERE title=${title})`;
			await client`DELETE FROM events WHERE title=${title}`;
			await client`DELETE FROM action_logs WHERE resource_type='whitelist' AND resource_id IN (SELECT id::text FROM whitelist WHERE login=${title})`;
			await client`DELETE FROM whitelist WHERE login=${title}`;
		}
	}
);

for (const javaScriptEnabled of [true, false]) {
	test.describe(`M19 JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'duplicates an event and saves its week as a template that can be applied',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const name = `M19_${randomUUID().slice(0, 8)}`;
				const savedEvents = await client`SELECT * FROM events`;
				const savedRegistrations = await client`SELECT * FROM registrations`;
				let templateId: number | undefined;
				try {
					await login(page.request);
					await client`DELETE FROM events WHERE week IN (3,4)`;
					const [source] =
						await client`INSERT INTO events (title,description,kind,week,weekday,event_date,start_time,end_time,max_slots,compensation) VALUES (${name},'Edited preset','rush',3,7,'2026-11-01','10:00','11:00',3,450) RETURNING id`;
					await client`INSERT INTO registrations (event_id,participant_login) VALUES (${source.id},'m19_participant')`;
					await page.goto('/admin?week=3');
					const article = page.getByRole('article', { name, exact: true });
					await article.getByRole('button', { name: 'Duplica', exact: true }).click();
					const duplicate = page.getByRole('dialog', { name: 'Duplica', exact: true });
					await expect(duplicate.getByLabel('Settimana evento', { exact: true })).toHaveValue('3');
					await expect(duplicate.getByLabel('Giorno', { exact: true })).toHaveValue('7');
					await duplicate.getByLabel('Settimana evento', { exact: true }).selectOption('4');
					await duplicate.getByLabel('Giorno', { exact: true }).selectOption('1');
					await duplicate.getByRole('button', { name: 'Duplica', exact: true }).click();
					await expect(page.getByRole('status')).toContainText('Evento creato');
					await page.goto('/admin?week=4');
					await expect(article).toBeVisible();
					await expect(article).toContainText('0/3');
					await expect(article).not.toContainText('m19_participant');
					await page
						.getByRole('button', { name: 'Salva settimana come template', exact: true })
						.click();
					const save = page.getByRole('dialog', {
						name: 'Salva settimana come template',
						exact: true
					});
					await expect(save.getByLabel('Settimana target', { exact: true })).toHaveValue('4');
					await save.getByLabel('Nome template', { exact: true }).fill(name);
					await save.getByLabel('Descrizione template', { exact: true }).fill('Saved week');
					await save.getByLabel('Settimana target', { exact: true }).selectOption('3');
					await save.getByRole('button', { name: 'Salva template', exact: true }).click();
					await expect(page.getByRole('status')).toContainText(`Template "${name}" creato`);
					const [template] = await client`SELECT id FROM week_templates WHERE name=${name}`;
					templateId = template.id;
					await page.goto('/admin/templates');
					const card = page.getByRole('article', { name, exact: true });
					await expect(card).toContainText('1 eventi');
					await card.getByRole('checkbox', { name: 'Sovrascrivi', exact: true }).check();
					await card.getByRole('button', { name: /^Applica template W/ }).click();
					await expect(page.getByRole('status')).toContainText(`Template "${name}" applicato!`);
					await page.goto('/admin?week=3');
					await expect(article).toBeVisible();
					await expect(article).toContainText('0/3');
					const [applied] = await client`SELECT weekday,kind,event_date FROM events WHERE week=3`;
					expect(applied).toMatchObject({ weekday: 1, kind: 'rush', event_date: null });
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
					).toBe(true);
					await client`DELETE FROM events WHERE week=4`;
					await page.goto('/admin?week=4');
					await page
						.getByRole('button', { name: 'Salva settimana come template', exact: true })
						.click();
					await save.getByLabel('Nome template', { exact: true }).fill(name + '_empty');
					await save.getByRole('button', { name: 'Salva template', exact: true }).click();
					await expect(page.getByRole('status')).toContainText('La settimana è vuota');
					expect(
						await client`SELECT id FROM week_templates WHERE name=${name + '_empty'}`
					).toHaveLength(0);
				} finally {
					await client.begin(async (tx) => {
						await tx`DELETE FROM events`;
						if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
						if (savedRegistrations.length)
							await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
						if (templateId !== undefined)
							await tx`DELETE FROM week_templates WHERE id=${templateId}`;
					});
				}
			}
		);
	});
}
