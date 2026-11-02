import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	const response = await page.request.post('/auth/dev', {
		form: { mode: 'create', login: `dlg_${randomUUID().slice(0, 12)}`, admin: 'on' },
		headers: { origin: 'http://localhost:4173', accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
});

const open = async (page: import('@playwright/test').Page) => {
	await page.getByRole('button', { name: 'Salva settimana come template', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Salva settimana come template', exact: true });
	await expect(dialog).toBeVisible();
	return dialog;
};

test('mobile sheet: no cancel button, unsaved edits ask before closing, drag closes', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 800 });
	await page.goto('/admin');
	let dialog = await open(page);
	await expect(dialog.getByRole('button', { name: 'Annulla', exact: true })).toBeHidden();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	dialog = await open(page);
	await dialog.getByLabel('Nome template').fill('Bozza');
	await page.keyboard.press('Escape');
	const confirm = page.getByRole('dialog', { name: 'Scartare le modifiche?', exact: true });
	await expect(confirm).toBeVisible();
	await confirm.getByRole('button', { name: 'Continua a modificare', exact: true }).click();
	await expect(confirm).toBeHidden();
	await expect(dialog.getByLabel('Nome template')).toHaveValue('Bozza');
	await page.keyboard.press('Escape');
	await confirm.getByRole('button', { name: 'Scarta', exact: true }).click();
	await expect(dialog).toBeHidden();

	dialog = await open(page);
	await expect(dialog.getByLabel('Nome template')).toHaveValue('');
	// Measure the handle once the sheet has finished sliding up.
	await dialog.evaluate((element) =>
		Promise.all(element.getAnimations().map((animation) => animation.finished))
	);
	const head = (await dialog.locator('.sheet-head').boundingBox())!;
	await page.mouse.move(head.x + head.width / 2, head.y + 10);
	await page.mouse.down();
	await page.mouse.move(head.x + head.width / 2, head.y + 400, { steps: 8 });
	await page.mouse.up();
	await expect(dialog).toBeHidden();
});

test('desktop dialog keeps «Annulla», which closes without asking', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/admin');
	const dialog = await open(page);
	await dialog.getByLabel('Nome template').fill('Bozza');
	await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Scartare le modifiche?' })).toHaveCount(0);
	await page.mouse.click(5, 5);
	await open(page);
	await page.mouse.click(5, 400);
	await expect(dialog).toBeHidden();
});
