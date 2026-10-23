import { expect, test } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
	test.describe(`theme HTML with JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled, colorScheme: 'dark' });
		test('serves an explicit light theme in the original HTML', async ({ page, context }) => {
			await context.addCookies([{ name: 'theme', value: 'light', url: 'http://localhost:4173' }]);
			const response = await page.goto('/');
			expect(await response!.text()).toContain('data-theme="light"');
			await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
			expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
				'light'
			);
		});
		test('ignores an invalid cookie and follows the system', async ({ page, context }) => {
			await context.addCookies([{ name: 'theme', value: 'invalid', url: 'http://localhost:4173' }]);
			const response = await page.goto('/');
			expect(await response!.text()).not.toContain('data-theme=');
			await expect(page.locator('html')).not.toHaveAttribute('data-theme');
			expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe(
				'light dark'
			);
		});
	});
}

test('follows system changes until toggled and persists the explicit choice', async ({
	page,
	context
}) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Passa al tema chiaro' })).toBeVisible();
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.getByRole('button', { name: 'Passa al tema scuro' })).toBeVisible();
	await page.getByRole('button', { name: 'Passa al tema scuro' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	const cookie = (await context.cookies()).find((cookie) => cookie.name === 'theme');
	expect(cookie).toMatchObject({ value: 'dark', path: '/', sameSite: 'Lax', httpOnly: false });
	expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 364 * 24 * 60 * 60);
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.emulateMedia({ colorScheme: 'light' });
	await expect(page.getByRole('button', { name: 'Passa al tema chiaro' })).toBeVisible();
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('button', { name: 'Passa al tema chiaro' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
