import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test(
	'design fits all required widths in both themes without CSP or browser errors',
	{ tag: '@shared-db' },
	async ({ page, context, browserName }, info) => {
		info.setTimeout(90000);
		const errors: string[] = [];
		const violations: { directive: string; source: string; blocked: string }[] = [];
		await page.exposeFunction(
			'reportCsp',
			(entry: { directive: string; source: string; blocked: string }) => violations.push(entry)
		);
		// WebKit reports the SSE stream cut by a full page navigation as an error.
		const record = (text: string) => {
			if (!text.endsWith('/api/stream due to access control checks.')) errors.push(text);
		};
		page.on('pageerror', (error) => record(error.message));
		await page.addInitScript(() => {
			document.addEventListener('securitypolicyviolation', (event) => {
				void (window as unknown as { reportCsp: (entry: unknown) => Promise<void> }).reportCsp({
					directive: event.violatedDirective,
					source: event.sourceFile,
					blocked: event.blockedURI
				});
			});
		});
		page.on('console', (message) => {
			if (message.type() === 'error') record(message.text());
		});
		await page.emulateMedia({ reducedMotion: 'reduce' });
		for (const theme of ['dark', 'light']) {
			await context.addCookies([{ name: 'theme', value: theme, url: 'http://localhost:4173' }]);
			for (const width of [360, 768, 1280]) {
				await page.setViewportSize({ width, height: 900 });
				await page.goto('/');
				// The landing is captured before authentication; later iterations use a fresh logged-out session.
				const capture = async (name: string) => {
					await page.evaluate(() => {
						window.scrollTo(0, 0);
						return document.fonts.ready;
					});
					await expect(page.locator('[style]:not(#svelte-announcer)')).toHaveCount(0);
					expect(
						await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
						`${name} ${theme} ${width}`
					).toBe(true);
					// Playwright screenshots inject a style element that WebKit reports as a CSP violation.
					if (browserName === 'webkit') return;
					const filename = `${width}-${name}.png`;
					const location =
						process.env.UPDATE_DESIGN_SCREENSHOTS === '1'
							? path.join('docs/v2/design/implemented', theme, filename)
							: info.outputPath(theme, filename);
					await mkdir(path.dirname(location), { recursive: true });
					await page.screenshot({ path: location, fullPage: false, animations: 'disabled' });
					await info.attach(`${theme}-${filename}`, { path: location, contentType: 'image/png' });
				};
				await capture('accesso');
				await page.goto('/auth/dev');
				await page.getByLabel('Utente esistente').selectOption({ label: 'dev_admin (admin)' });
				await page.getByRole('button', { name: 'Entra', exact: true }).click();
				await expect(page).toHaveURL('/calendar');
				for (const [route, name] of [
					['/calendar', 'calendario'],
					['/profile', 'profilo'],
					['/display', 'display'],
					['/admin', 'admin-settimana'],
					['/admin/templates', 'admin-template'],
					['/admin/templates/new', 'admin-nuovo-template'],
					['/admin/participants', 'admin-partecipanti'],
					['/admin/whitelist', 'admin-whitelist'],
					['/admin/logs', 'admin-log']
				]) {
					await page.goto(route);
					await expect(page.locator('main')).toBeVisible();
					if (route === '/admin/templates/new') {
						await page.getByLabel('Nome template', { exact: true }).fill('Anteprima template');
						for (const day of [1, 2, 3, 4, 5]) {
							await page.getByRole('button', { name: 'Aggiungi riga', exact: true }).click();
							const editor = page.getByRole('group', { name: `Evento ${day}`, exact: true });
							await editor.getByLabel('Titolo', { exact: true }).fill('Sorveglianza esami');
							await editor.getByText('Giorno, data e descrizione', { exact: true }).click();
							await editor.getByLabel('Giorno', { exact: true }).selectOption(String(day));
							await editor.getByText('Giorno, data e descrizione', { exact: true }).click();
						}
					}
					await capture(name);
				}
				await page.request.post('/auth/logout', {
					headers: { origin: 'http://localhost:4173' },
					maxRedirects: 0
				});
			}
		}
		expect(errors).toEqual([]);
		expect(violations).toEqual([]);
	}
);
