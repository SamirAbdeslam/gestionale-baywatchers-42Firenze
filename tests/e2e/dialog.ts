import type { Page } from '@playwright/test';

// «Annulla» is desktop-only once JavaScript runs; on phones the sheet closes with Escape (or a drag).
export async function cancelDialog(page: Page, { discard = false } = {}) {
	const cancel = page
		.getByRole('dialog')
		.first()
		.getByRole('button', { name: 'Annulla', exact: true });
	if (await cancel.isVisible()) return cancel.click();
	await page.keyboard.press('Escape');
	if (discard) await page.getByRole('button', { name: 'Scarta', exact: true }).click();
}
