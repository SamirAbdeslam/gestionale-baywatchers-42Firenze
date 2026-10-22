import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
	test.describe(`navigation JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test('keeps desktop links visible and opens and dismisses the mobile menu', async ({
			page
		}) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const response = await page.request.post('/auth/dev', {
				form: { mode: 'create', login: `nav_${randomUUID().replaceAll('-', '').slice(0, 20)}` },
				headers: { origin: 'http://localhost:4173', accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status()).toBe(303);
			await page.setViewportSize({ width: 1280, height: 800 });
			await page.goto('/calendar');
			const menu = page.getByRole('button', { name: 'Menu', exact: true });
			const nav = page.locator('#main-navigation');
			await expect(menu).toBeHidden();
			await expect(nav).toBeVisible();
			await page.getByRole('link', { name: 'Profilo', exact: true }).click();
			await expect(page).toHaveURL('/profile');
			await expect(nav).toBeVisible();

			await page.setViewportSize({ width: 360, height: 800 });
			await expect(menu).toBeVisible();
			await expect(nav).toBeHidden();
			const header = await page.locator('header').boundingBox();
			await menu.click();
			await expect(nav).toBeVisible();
			expect(await page.locator('header').boundingBox()).toEqual(header);
			await page.keyboard.press('Escape');
			await expect(nav).toBeHidden();
			await expect(menu).toBeFocused();
			await menu.click();
			await expect(nav).toBeVisible();
			await page.locator('h1').click();
			await expect(nav).toBeHidden();
			await menu.click();
			await page.getByRole('link', { name: 'Calendario', exact: true }).click();
			await expect(page).toHaveURL('/calendar');
			await expect(nav).toBeHidden();
			await menu.click();
			await page.getByRole('link', { name: 'Profilo', exact: true }).click();
			await expect(page).toHaveURL('/profile');
			await expect(nav).toBeHidden();
			await page.setViewportSize({ width: 1280, height: 800 });
			await expect(nav).toBeVisible();
			await expect(menu).toBeHidden();
			expect(errors).toEqual([]);
		});
	});
}
