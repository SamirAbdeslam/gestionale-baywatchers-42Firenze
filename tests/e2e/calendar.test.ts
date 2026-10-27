import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import {
	expect,
	test,
	request as playwrightRequest,
	type APIRequestContext
} from '@playwright/test';
const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function setup(request: APIRequestContext, admin = false, dates = true) {
	const name = `m7_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
	const response = await request.post('/auth/dev', {
		form: { mode: 'create', login: name, ...(admin ? { admin: 'on' } : {}) },
		headers: { origin, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	const [settings] = await client`SELECT * FROM settings WHERE id=1`;
	const savedEvents = await client`SELECT * FROM events WHERE week=2`;
	const savedRegistrations =
		await client`SELECT r.* FROM registrations r JOIN events e ON r.event_id=e.id WHERE e.week=2`;
	await client`DELETE FROM events WHERE week=2`;
	await client`UPDATE settings SET active_week=2,max_events_per_user=0,pool_start='2000-01-03',pool_end=null WHERE id=1`;
	await client`INSERT INTO whitelist(login) VALUES (${name})`;
	const [event] =
		await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots,compensation) VALUES (${'<img src=x onerror=alert(1)> ' + name},2,1,${dates ? '2099-01-05' : null},'09:00','11:00',3,200) RETURNING id,title`;
	await client`INSERT INTO registrations(event_id,participant_login,attended) VALUES (${event.id},${name + '_visible'},true),(${event.id},${name + '_hidden'},false)`;
	return {
		name,
		id: event.id as number,
		title: event.title as string,
		cleanup: async () => {
			await client.begin(async (tx) => {
				await tx`DELETE FROM events WHERE week=2`;
				if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
				if (savedRegistrations.length)
					await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
				await tx`UPDATE settings SET ${tx(settings, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
				await tx`DELETE FROM action_logs WHERE actor_login=${name}`;
				await tx`DELETE FROM whitelist WHERE login=${name}`;
				await tx`DELETE FROM users WHERE login=${name}`;
			});
		}
	};
}
for (const { javaScriptEnabled, reducedMotion } of [
	{ javaScriptEnabled: true, reducedMotion: 'no-preference' },
	{ javaScriptEnabled: false, reducedMotion: 'no-preference' },
	{ javaScriptEnabled: true, reducedMotion: 'reduce' }
] as const)
	test.describe(`calendar JavaScript ${javaScriptEnabled}, motion ${reducedMotion}`, () => {
		test.use({ javaScriptEnabled, reducedMotion });
		test(
			'navigates available weeks, redacts absences, registers, opens calendar links, downloads ICS and unregisters',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const fixture = await setup(page.request);
				const limit = javaScriptEnabled && reducedMotion === 'no-preference' ? 3 : 0;
				if (limit) await client`UPDATE settings SET max_events_per_user=${limit} WHERE id=1`;
				try {
					let alerts = 0;
					page.on('dialog', async (dialog) => {
						alerts++;
						await dialog.dismiss();
					});
					const [full] =
						await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${'Full ' + fixture.name},2,2,'2099-01-06','09:00','10:00',1) RETURNING id`;
					await client`INSERT INTO registrations(event_id,participant_login,attended) VALUES (${full.id},${fixture.name + '_full_hidden'},false)`;
					await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time) VALUES (${'Past ' + fixture.name},2,3,'2000-01-05','09:00','10:00'),(${'Sunday ' + fixture.name},2,7,'2099-01-11','09:00','10:00')`;
					await page.goto('/calendar?week=4');
					await expect(
						page.getByRole('heading', { name: 'Settimana 2', exact: true })
					).toBeVisible();
					await expect(page.getByRole('link', { name: /W02.*Settimana successiva/ })).toHaveCount(
						0
					);
					// Day panels remain in the horizontally scrollable calendar on mobile.
					await expect(
						page.getByRole('heading', { name: /Domenica/, includeHidden: true })
					).toHaveCount(1);
					await expect(
						page.getByRole('heading', { name: /Sabato/, includeHidden: true })
					).toHaveCount(0);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						await page.getByRole('tab', { name: /^Dom/ }).click();
						await expect(page.locator('#panel-7')).toBeVisible();
						const staff = await playwrightRequest.newContext({ baseURL: origin });
						try {
							const [admin] = await client`SELECT id FROM users WHERE login='dev_admin'`;
							expect(
								(
									await staff.post('/auth/dev', {
										form: { mode: 'existing', userId: String(admin.id) },
										headers: { origin, accept: 'text/html' },
										maxRedirects: 0
									})
								).status()
							).toBe(303);
							const [sunday] =
								await client`SELECT id FROM events WHERE title=${'Sunday ' + fixture.name}`;
							expect(
								(
									await staff.post('/admin?/deleteEvent&week=2', {
										form: { id: String(sunday.id) },
										headers: { origin },
										maxRedirects: 0
									})
								).status()
							).toBe(200);
							await expect(page.getByRole('tab', { name: /^Dom/ })).toHaveCount(0);
							await expect(page.locator('#panel-1')).toBeVisible();
						} finally {
							await staff.dispose();
						}
					}
					await page.getByRole('link', { name: /W01.*Settimana precedente/ }).click();
					await expect(page).toHaveURL('/calendar?week=1');
					if (javaScriptEnabled) await expect(page.locator('#panel-1')).toBeVisible();
					await expect(page.getByRole('link', { name: /W01.*Settimana precedente/ })).toHaveCount(
						0
					);
					await page.getByRole('link', { name: /W02.*Settimana successiva/ }).click();
					await expect(
						page
							.getByRole('navigation', { name: 'Settimane', exact: true })
							.getByRole('link', { name: /W02/ })
					).toHaveAttribute('aria-current', 'page');
					await expect(page.getByRole('heading', { name: /Lunedì/, level: 2 })).toHaveCount(1);
					const article = page
						.locator('.calendar')
						.getByRole('article', { name: fixture.title, exact: true });
					await expect(article).toContainText('2/3');
					await expect(
						article.getByRole('heading', { name: fixture.title, exact: true, level: 3 })
					).toBeVisible();
					await expect(article).toContainText('₳ 200');
					await expect(article).toContainText('09:00–11:00');
					await expect(article).toContainText(fixture.name + '_visible');
					expect(await page.content()).not.toContain(fixture.name + '_hidden');
					expect(await page.content()).not.toContain(fixture.name + '_full_hidden');
					await expect(article.locator('img')).toHaveCount(0);
					if (javaScriptEnabled) await page.getByRole('tab', { name: /^Mar/ }).click();
					await expect(
						page.getByRole('article', { name: 'Full ' + fixture.name, exact: true })
					).toContainText('Turno pieno');
					if (javaScriptEnabled) await page.getByRole('tab', { name: /^Mer/ }).click();
					await expect(
						page
							.getByRole('article', { name: 'Past ' + fixture.name, exact: true })
							.getByRole('button')
					).toHaveCount(0);
					if (javaScriptEnabled) await page.getByRole('tab', { name: /^Lun/ }).click();
					if (limit)
						await expect(page.locator('[data-counter-value]')).toHaveText(
							'0 di 3 turni questa settimana · 0 ₳'
						);
					else await expect(page.locator('[data-counter-value]')).toHaveText('0 · 0 ₳');
					await expect(
						page.getByRole('region', { name: 'I tuoi turni', exact: true })
					).toBeVisible();
					if (!limit) await expect(page.locator('[data-counter-slot]')).toHaveCount(0);
					await article.getByRole('button', { name: 'Prendo il turno', exact: true }).click();
					const dialog = page.getByRole('dialog', { name: 'Il turno è tuo', exact: true });
					await expect(dialog).toBeVisible();
					const google = new URL(
						(await dialog
							.getByRole('link', { name: 'Google Calendar', exact: true })
							.getAttribute('href'))!
					);
					expect(google.searchParams.get('text')).toBe(fixture.title);
					expect(google.searchParams.get('dates')).toBe('20990105T080000Z/20990105T100000Z');
					const downloadPromise = page.waitForEvent('download');
					await dialog.getByRole('link', { name: 'Scarica file ICS', exact: true }).click();
					const download = await downloadPromise;
					expect(download.suggestedFilename()).toBe(`evento_${fixture.id}.ics`);
					expect(await download.failure()).toBeNull();
					const ics = await readFile((await download.path())!, 'utf8');
					expect(ics).toContain('DTSTART;TZID=Europe/Rome:20990105T090000');
					expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
					await dialog.getByRole('button', { name: 'Chiudi', exact: true }).click();
					await expect(dialog).not.toBeVisible();
					await expect(article.locator('strong')).toHaveText(fixture.name);
					if (limit)
						await expect(page.locator('[data-counter-value]')).toHaveText(
							'1 di 3 turni questa settimana · 200 ₳'
						);
					else await expect(page.locator('[data-counter-value]')).toHaveText('1 · 200 ₳');
					const next = page.getByRole('region', { name: 'Il tuo prossimo turno', exact: true });
					await expect(next).toContainText(fixture.title);
					await expect(
						next.getByRole('link', { name: 'Scarica file ICS', exact: true })
					).toHaveJSProperty('href', `${origin}/events/${fixture.id}/calendar.ics`);
					await expect(article).toContainText('3/3');
					await expect(article).toHaveClass(/\bmine\b/);
					await expect(page.locator('.ticket-flyer,.ticket-restore,.paper-fiber')).toHaveCount(0);
					await article.getByRole('button', { name: 'Lascio', exact: true }).first().click();
					await expect(
						article.getByRole('button', { name: 'Prendo il turno', exact: true })
					).toBeVisible();
					await expect(article).not.toHaveClass(/\bmine\b/);
					if (limit)
						await expect(page.locator('[data-counter-value]')).toHaveText(
							'0 di 3 turni questa settimana · 0 ₳'
						);
					else await expect(page.locator('[data-counter-value]')).toHaveText('0 · 0 ₳');
					await expect(page.locator('.ticket-flyer,.ticket-restore,.paper-fiber')).toHaveCount(0);
					expect((await page.request.get('/participants/123')).status()).toBe(404);
					expect((await page.request.get('/events/2147483647/calendar.ics')).status()).toBe(404);
					expect((await page.request.get('/events/0x2/calendar.ics')).status()).toBe(400);
					expect(
						(
							await client`SELECT action_type FROM action_logs WHERE actor_login=${fixture.name} AND action_type<>'LOGIN' ORDER BY id`
						).map((row) => row.action_type)
					).toEqual(['REGISTER_EVENT', 'UNREGISTER_EVENT']);
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
					await client`UPDATE settings SET max_events_per_user=11 WHERE id=1`;
					await page.reload();
					await expect(page.locator('[data-counter-value]')).toHaveText(
						'0 di 11 turni questa settimana · 0 ₳'
					);
					await expect(page.locator('[data-counter-slot]')).toHaveCount(0);
					expect(alerts).toBe(0);
				} finally {
					await fixture.cleanup();
				}
			}
		);
	});
test(
	'hides the calendar without a pool and retains the explicit ICS conflict',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const fixture = await setup(page.request, false, false);
		try {
			await client`UPDATE settings SET pool_start=null,pool_end=null WHERE id=1`;
			await page.goto('/calendar');
			await expect(page.locator('div.calendar')).toHaveCount(0);
			await expect(
				page.getByText(
					'Ehi, qui è tutto vuoto… la prossima piscina aspetta anche te! Fatti avanti con lo staff.',
					{ exact: true }
				)
			).toBeVisible();
			const response = await page.request.get(`/events/${fixture.id}/calendar.ics`);
			expect(response.status()).toBe(409);
			expect(await response.text()).toContain("Impossibile determinare la data dell'evento");
		} finally {
			await fixture.cleanup();
		}
	}
);
test(
	'admins see absent participants while counts include all registrations',
	{ tag: '@shared-db' },
	async ({ page }) => {
		const fixture = await setup(page.request, true);
		try {
			await page.goto('/calendar');
			const article = page
				.locator('.calendar')
				.getByRole('article', { name: fixture.title, exact: true });
			await expect(article).toContainText(fixture.name + '_hidden');
			await expect(article).toContainText('Non partecipato');
			await expect(article).toContainText('2/3');
		} finally {
			await fixture.cleanup();
		}
	}
);

for (const javaScriptEnabled of [true, false]) {
	test.describe(`weekly shifts JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'disables new bookings at the weekly limit and shows the next shift on both pages',
			{ tag: '@shared-db' },
			async ({ page, context }) => {
				const fixture = await setup(page.request);
				try {
					await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
					const [second] =
						await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time) VALUES (${'Second ' + fixture.name},2,1,'2099-01-05','12:00','13:00') RETURNING id`;
					await page.goto('/calendar');
					await expect(
						page.getByRole('region', { name: 'Il tuo prossimo turno', exact: true })
					).toHaveCount(0);
					await page
						.locator('.calendar')
						.getByRole('article', { name: fixture.title, exact: true })
						.getByRole('button', { name: 'Prendo il turno', exact: true })
						.click();
					await page
						.getByRole('dialog')
						.getByRole('button', { name: 'Chiudi', exact: true })
						.click();
					await expect(page.locator('[data-counter-value]')).toHaveText(
						'1 di 1 turni questa settimana · 200 ₳'
					);
					const secondButton = page
						.locator('.calendar')
						.getByRole('article', { name: 'Second ' + fixture.name, exact: true })
						.getByRole('button', { name: 'Prendo il turno', exact: true });
					await expect(secondButton).toBeDisabled();
					await expect(secondButton).toHaveAttribute('aria-describedby', 'weekly-limit-reason');
					await expect(page.locator('#weekly-limit-reason')).toContainText(
						'Hai raggiunto il limite massimo di 1 eventi'
					);
					await expect(
						page.getByRole('region', { name: 'Il tuo prossimo turno', exact: true })
					).toContainText(fixture.title);
					// The server enforces the same limit even if the disabled UI is bypassed.
					const rejected = await page.request.post('/calendar?/register', {
						form: { id: String(second.id) },
						headers: { origin }
					});
					expect(rejected.status()).toBe(400);
					await page.goto('/calendar?week=1');
					await expect(page.locator('[data-counter-value]')).toContainText('0 di 1 turni');
					await expect(
						page.getByRole('region', { name: 'Il tuo prossimo turno', exact: true })
					).toContainText(fixture.title);
					await page.goto('/profile');
					const next = page.getByRole('region', { name: 'Il tuo prossimo turno', exact: true });
					await expect(next).toContainText(fixture.title);
					await expect(next).toContainText('09:00–11:00');
					await expect(next.getByRole('link')).toHaveJSProperty(
						'href',
						`${origin}/events/${fixture.id}/calendar.ics`
					);
					if (javaScriptEnabled) {
						const otherTab = await context.newPage();
						try {
							await otherTab.goto('/calendar');
							await otherTab
								.locator('.calendar')
								.getByRole('article', { name: fixture.title, exact: true })
								.getByRole('button', { name: 'Lascio', exact: true })
								.first()
								.click();
							await expect(next).toHaveCount(0);
						} finally {
							await otherTab.close();
						}
					}
					await client`UPDATE settings SET max_events_per_user=0 WHERE id=1`;
					await page.goto('/calendar');
					await expect(
						page.getByRole('region', { name: 'I tuoi turni', exact: true })
					).toBeVisible();
					await expect(page.locator('[data-counter-value]')).toHaveText(
						javaScriptEnabled ? '0 · 0 ₳' : '1 · 200 ₳'
					);
					await expect(page.locator('[data-counter-value]')).not.toContainText(' di ');
					await expect(page.locator('[data-counter-slot]')).toHaveCount(0);
					await expect(secondButton).toBeEnabled();
				} finally {
					await fixture.cleanup();
				}
			}
		);
	});
}
