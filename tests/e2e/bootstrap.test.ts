import { expect, test } from '@playwright/test';
import { m } from '../../src/lib/paraglide/messages.js';

test('healthz checks the database', async ({ request }) => {
	const response = await request.get('/healthz');
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: 'ok' });
});

test('landing is Italian and fits the viewport', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await expect(page.getByRole('heading', { name: m.landing_title() })).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'it');
	await page.setViewportSize({ width: 360, height: 800 });
	expect(errors).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
});

test('robots.txt is served as plain text', async ({ request }) => {
	const response = await request.get('/robots.txt');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toMatch(/^text\/plain\b/);
	expect(await response.text()).toBe('User-agent: *\nAllow: /\n');
});
