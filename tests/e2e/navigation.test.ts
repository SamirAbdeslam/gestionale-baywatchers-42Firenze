import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
	test.describe(`navigation JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test('keeps desktop and mobile navigation visible with the current page marked', async ({
			page
		}) => {
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const response = await page.request.post('/auth/dev', {
				form: {
					mode: 'create',
					login: `nav_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
					admin: 'on'
				},
				headers: { origin: 'http://localhost:4173', accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status()).toBe(303);
			await page.goto('/calendar');
			const nav = page.locator('#main-navigation');
			for (const width of [360, 768, 1280]) {
				await page.setViewportSize({ width, height: 800 });
				await expect(nav).toBeVisible();
				await expect(nav.getByRole('link', { name: 'Calendario', exact: true })).toHaveAttribute(
					'aria-current',
					'page'
				);
				await nav.getByRole('link', { name: 'Profilo', exact: true }).click();
				await expect(page).toHaveURL('/profile');
				if (javaScriptEnabled) {
					await expect(page.locator('#svelte-announcer')).toContainText('Profilo');
					expect(
						await page
							.locator('#svelte-announcer')
							.evaluate((element) => element.getBoundingClientRect().width)
					).toBe(1);
				}
				await expect(nav.getByRole('link', { name: 'Profilo', exact: true })).toHaveAttribute(
					'aria-current',
					'page'
				);
				await nav.getByRole('link', { name: 'Admin', exact: true }).click();
				await expect(page).toHaveURL('/admin');
				await page.getByRole('link', { name: 'Whitelist', exact: true }).click();
				await expect(page).toHaveURL('/admin/whitelist');
				await expect(page.getByRole('link', { name: 'Whitelist', exact: true })).toHaveAttribute(
					'aria-current',
					'page'
				);
				await nav.getByRole('link', { name: 'Calendario', exact: true }).click();
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
					true
				);
			}
			expect(errors).toEqual([]);
		});
	});
}

test(
	'admin subnavigation keeps the configured TV token on a different admin page',
	{ tag: '@shared-db' },
	async ({ browser, request }) => {
		const { spawn } = await import('node:child_process');
		const token = 'local-display-token-for-M14-42&?';
		const server = spawn(process.execPath, ['build'], {
			env: {
				...process.env,
				HOST: '127.0.0.1',
				PORT: '4174',
				ORIGIN: 'http://localhost:4173',
				NODE_ENV: 'production',
				AUTH_DEV_LOGIN: 'true',
				DISPLAY_TOKEN: token,
				DISPLAY_REDIRECT_URL: '',
				TZ: 'Europe/Rome',
				DATABASE_URL:
					process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test'
			},
			stdio: 'ignore'
		});
		const context = await browser.newContext({ javaScriptEnabled: false });
		try {
			await expect
				.poll(async () => {
					if (server.exitCode !== null)
						throw new Error(`Token test server exited: ${server.exitCode}`);
					try {
						return (await request.get('http://localhost:4174/healthz')).status();
					} catch {
						return 0;
					}
				})
				.toBe(200);
			const response = await context.request.post('http://localhost:4173/auth/dev', {
				form: { mode: 'create', login: `token_${randomUUID().slice(0, 12)}`, admin: 'on' },
				headers: { origin: 'http://localhost:4173', accept: 'text/html' },
				maxRedirects: 0
			});
			expect(response.status()).toBe(303);
			const page = await context.newPage();
			await page.goto('http://localhost:4174/admin/templates');
			const link = page
				.getByRole('navigation', { name: 'Admin', exact: true })
				.getByRole('link', { name: /Apri il display TV/ });
			await expect(link).toHaveAttribute(
				'href',
				`http://localhost:4173/display?token=${encodeURIComponent(token)}`
			);
			expect((await request.get('http://localhost:4174/display')).status()).toBe(404);
		} finally {
			await context.close();
			const stopped = new Promise<void>((resolve) => {
				if (server.exitCode !== null || server.signalCode !== null) resolve();
				else server.once('exit', () => resolve());
			});
			// The isolated read-only server keeps its Postgres pool alive after SIGTERM.
			server.kill('SIGKILL');
			await stopped;
		}
	}
);
