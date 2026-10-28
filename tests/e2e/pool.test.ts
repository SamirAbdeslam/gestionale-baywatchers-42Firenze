import assert from 'node:assert/strict';
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
	test(
		`pool panel closes, saves, reopens and cleans confirmed choices (JavaScript ${javaScriptEnabled})`,
		{ tag: '@shared-db' },
		async ({ browser }) => {
			const context = await browser.newContext({
				javaScriptEnabled,
				baseURL: origin,
				locale: 'it-IT',
				viewport: { width: 360, height: 800 }
			});
			const page = await context.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			const pools = await client`SELECT * FROM pools`;
			const entries = await client`SELECT * FROM pool_entries`;
			const events = await client`SELECT * FROM events`;
			const registrations = await client`SELECT * FROM registrations`;
			const whitelist = await client`SELECT * FROM whitelist`;
			const settings = await client`SELECT * FROM settings`;
			const templates = await client`SELECT * FROM week_templates ORDER BY id`;
			const templateEvents = await client`SELECT * FROM template_events ORDER BY id`;
			try {
				await client`UPDATE settings SET pool_closed_at=null,pool_reopened=false,active_week=4,display_week=3,pool_start='2000-01-03',pool_end='2099-12-31' WHERE id=1`;
				const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
				expect(
					(
						await context.request.post('/auth/dev', {
							form: { mode: 'existing', userId: String(admin.id) },
							headers: { origin, accept: 'text/html' },
							maxRedirects: 0
						})
					).status()
				).toBe(303);
				await page.goto('/admin');
				const panel = page.getByRole('region', { name: 'Piscina', exact: true });
				await expect(panel.getByRole('button', { name: 'Pulizia', exact: true })).toBeDisabled();
				await panel.getByRole('button', { name: 'Chiudi piscina', exact: true }).click();
				let dialog = page.getByRole('dialog', { name: 'Chiudi piscina', exact: true });
				await expect(dialog).toBeVisible();
				await dialog.getByRole('checkbox').check();
				await dialog.getByRole('button', { name: 'Chiudi piscina', exact: true }).click();
				await expect(
					panel.getByRole('button', { name: 'Riapri piscina', exact: true })
				).toBeVisible();
				await expect(panel.getByRole('status')).toHaveText('La piscina è finita');
				expect(await client`SELECT * FROM events`).toEqual(events);
				expect(await client`SELECT * FROM registrations`).toEqual(registrations);
				expect(
					await client`SELECT * FROM pool_entries WHERE pool_id=(SELECT id FROM pools WHERE start_date='2000-01-03')`
				).toHaveLength(registrations.length);
				await panel.getByRole('button', { name: 'Salva archivio', exact: true }).click();
				await expect(
					page.getByRole('status').filter({ hasText: 'Archivio salvato.' })
				).toBeVisible();
				await panel.getByRole('button', { name: 'Riapri piscina', exact: true }).click();
				dialog = page.getByRole('dialog', { name: 'Riapri piscina', exact: true });
				await dialog.getByRole('checkbox').check();
				await dialog.getByRole('button', { name: 'Riapri piscina', exact: true }).click();
				await expect(panel.getByRole('button', { name: 'Pulizia', exact: true })).toBeDisabled();
				expect((await client`SELECT pool_closed_at,pool_reopened FROM settings`)[0]).toMatchObject({
					pool_closed_at: null,
					pool_reopened: true
				});
				await panel.getByRole('button', { name: 'Chiudi piscina', exact: true }).click();
				dialog = page.getByRole('dialog', { name: 'Chiudi piscina', exact: true });
				await dialog.getByRole('checkbox').check();
				await dialog.getByRole('button', { name: 'Chiudi piscina', exact: true }).click();
				await expect(panel.getByRole('button', { name: 'Pulizia', exact: true })).toBeEnabled();
				await panel.getByRole('button', { name: 'Pulizia', exact: true }).click();
				dialog = page.getByRole('dialog', { name: 'Pulizia', exact: true });
				await expect(dialog.locator('input[type=checkbox]:checked')).toHaveCount(0);
				await dialog.getByRole('checkbox', { name: 'Whitelist', exact: true }).check();
				await dialog.getByRole('button', { name: 'Annulla', exact: true }).click();
				expect(await client`SELECT * FROM whitelist`).toEqual(whitelist);
				await panel.getByRole('button', { name: 'Pulizia', exact: true }).click();
				for (const name of [
					'Tutti gli eventi e le relative iscrizioni',
					'Whitelist',
					'Settimane attiva e display a 1',
					'Date del pool'
				]) {
					await dialog.getByRole('checkbox', { name, exact: true }).check();
				}
				await dialog.locator('input[name=confirm]').check();
				await expect(dialog).toContainText('Vuoi salvare l’archivio prima di eliminare?');
				await dialog
					.getByRole('button', { name: 'Salva ed elimina (consigliato)', exact: true })
					.click();
				await expect(
					page.getByRole('status').filter({ hasText: 'Pulizia completata.' })
				).toBeVisible();
				expect(await client`SELECT * FROM events`).toEqual([]);
				expect(await client`SELECT * FROM registrations`).toEqual([]);
				expect(await client`SELECT * FROM whitelist`).toEqual([]);
				expect(
					(
						await client`SELECT pool_start,pool_end,pool_closed_at,pool_reopened,active_week,display_week FROM settings`
					)[0]
				).toEqual({
					pool_start: null,
					pool_end: null,
					pool_closed_at: null,
					pool_reopened: false,
					active_week: 1,
					display_week: 1
				});
				expect(await client`SELECT * FROM week_templates ORDER BY id`).toEqual(templates);
				expect(await client`SELECT * FROM template_events ORDER BY id`).toEqual(templateEvents);
				expect(
					await client`SELECT * FROM pool_entries WHERE pool_id=(SELECT id FROM pools WHERE start_date='2000-01-03')`
				).toHaveLength(registrations.length);
				expect(
					(await client`SELECT action_type FROM action_logs ORDER BY id DESC LIMIT 1`)[0]
						.action_type
				).toBe('CLEAN_POOL');
				expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
					true
				);
				expect(errors).toEqual([]);
			} finally {
				await context.close();
				await client.begin(async (tx) => {
					await tx`DELETE FROM pools`;
					if (pools.length) await tx`INSERT INTO pools ${tx(pools)}`;
					if (entries.length) await tx`INSERT INTO pool_entries ${tx(entries)}`;
					await tx`DELETE FROM events`;
					if (events.length) await tx`INSERT INTO events ${tx(events)}`;
					if (registrations.length) await tx`INSERT INTO registrations ${tx(registrations)}`;
					await tx`DELETE FROM whitelist`;
					if (whitelist.length) await tx`INSERT INTO whitelist ${tx(whitelist)}`;
					await tx`DELETE FROM settings`;
					await tx`INSERT INTO settings ${tx(settings)}`;
				});
			}
		}
	);
}
for (const automatic of [false, true]) {
	test(
		`student receives pool_closed popup and recap (${automatic ? 'automatic' : 'manual'})`,
		{ tag: '@shared-db' },
		async ({ page, browser }) => {
			const context = await browser.newContext({ baseURL: origin, locale: 'it-IT' });
			const [config] = await client`SELECT * FROM settings`;
			const savedEvents = await client`SELECT id,event_date FROM events`;
			const savedPools = await client`SELECT * FROM pools`;
			const savedEntries = await client`SELECT * FROM pool_entries`;
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			try {
				await client`UPDATE settings SET pool_start='2000-01-03',pool_end='2099-12-31',pool_closed_at=null,pool_reopened=false WHERE id=1`;
				for (const [request, login] of [
					[page.request, 'dev_user'],
					[context.request, 'dev_admin']
				] as const) {
					const [user] = await client`SELECT id FROM users WHERE login=${login}`;
					expect(
						(
							await request.post('/auth/dev', {
								form: { mode: 'existing', userId: String(user.id) },
								headers: { origin, accept: 'text/html' },
								maxRedirects: 0
							})
						).status()
					).toBe(303);
				}
				let streams = 0;
				page.on('request', (request) => {
					if (new URL(request.url()).pathname === '/api/stream') streams += 1;
				});
				const opened = page.waitForResponse(
					(response) =>
						new URL(response.url()).pathname === '/api/stream' && response.status() === 200
				);
				await page.goto(automatic ? '/profile' : '/calendar');
				await opened;
				expect(streams).toBe(1);
				if (automatic) {
					await client`UPDATE events SET event_date=null`;
					await client`UPDATE settings SET pool_end='2000-12-31' WHERE id=1`;
					expect((await context.request.get('/admin')).status()).toBe(200);
				} else
					expect(
						(
							await context.request.post('/admin?/closePool', {
								form: { confirm: 'yes' },
								headers: { origin }
							})
						).status()
					).toBe(200);
				const dialog = page.getByRole('dialog', { name: 'La piscina è finita!', exact: true });
				await expect(dialog).toBeVisible();
				await dialog.getByRole('button', { name: 'OK', exact: true }).click();
				await expect(page).toHaveURL('/calendar');
				await expect(page.locator('div.calendar')).toHaveCount(0);
				await expect(
					page
						.locator('.recap')
						.or(
							page.getByText(
								'Ehi, qui è tutto vuoto… la prossima piscina aspetta anche te! Fatti avanti con lo staff.',
								{ exact: true }
							)
						)
				).toBeVisible();
				if (!automatic) {
					expect(
						(
							await context.request.post('/admin?/reopenPool', {
								form: { confirm: 'yes' },
								headers: { origin }
							})
						).status()
					).toBe(200);
					await expect(page.locator('div.calendar')).toBeVisible();
					expect(
						(
							await context.request.post('/admin?/closePool', {
								form: { confirm: 'yes' },
								headers: { origin }
							})
						).status()
					).toBe(200);
					await expect(dialog).toBeVisible();
					await dialog.getByRole('button', { name: 'OK', exact: true }).click();
					await expect(page.locator('div.calendar')).toHaveCount(0);
				}
				await expect(page.getByRole('dialog', { name: /La settimana/ })).toHaveCount(0);
				const [log] =
					await client`SELECT actor_login,actor_user_id FROM action_logs WHERE action_type='CLOSE_POOL' ORDER BY id DESC LIMIT 1`;
				expect(log.actor_login).toBe(automatic ? 'SYSTEM' : 'dev_admin');
				if (automatic) expect(log.actor_user_id).toBeNull();
				expect(errors).toEqual([]);
			} finally {
				await page.goto('/');
				await context.close();
				await client`UPDATE settings SET ${client(config, 'pool_start', 'pool_end', 'pool_closed_at', 'pool_reopened')} WHERE id=1`;
				for (const row of savedEvents)
					await client`UPDATE events SET event_date=${row.event_date} WHERE id=${row.id}`;
				await client`DELETE FROM pools`;
				if (savedPools.length) await client`INSERT INTO pools ${client(savedPools)}`;
				if (savedEntries.length) await client`INSERT INTO pool_entries ${client(savedEntries)}`;
			}
		}
	);
}
