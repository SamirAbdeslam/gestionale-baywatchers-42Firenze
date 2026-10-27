import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function login(request: APIRequestContext, name: string, admin = false) {
	expect(
		(
			await request.post('/auth/dev', {
				form: { mode: 'create', login: name, ...(admin ? { admin: 'on' } : {}) },
				headers: { origin, accept: 'text/html' },
				maxRedirects: 0
			})
		).status()
	).toBe(303);
}
async function setup(user: APIRequestContext, admin: APIRequestContext) {
	const name = 'm9_' + randomUUID().replaceAll('-', '').slice(0, 14);
	await login(user, name);
	await login(admin, name + '_admin', true);
	const [settings] = await client`SELECT * FROM settings WHERE id=1`;
	const savedEvents = await client`SELECT * FROM events WHERE week IN (1,2)`;
	const savedRegistrations =
		await client`SELECT r.* FROM registrations r JOIN events e ON r.event_id=e.id WHERE e.week IN (1,2)`;
	await client`DELETE FROM events WHERE week IN (1,2)`;
	await client`UPDATE settings SET active_week=1,display_week=1,pool_start='2000-01-03',pool_end='2099-12-31',max_events_per_user=0 WHERE id=1`;
	await client`INSERT INTO whitelist(login) VALUES (${name})`;
	const [event] =
		await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${name},1,1,'2099-01-05','09:00','10:00',2) RETURNING id`;
	await client`INSERT INTO events(title,week,weekday,event_date,start_time,end_time) VALUES (${name + '_next'},2,1,'2099-01-12','09:00','10:00')`;
	return {
		name,
		id: event.id as number,
		cleanup: async () => {
			await client.begin(async (tx) => {
				await tx`DELETE FROM events WHERE week IN (1,2)`;
				if (savedEvents.length) await tx`INSERT INTO events ${tx(savedEvents)}`;
				if (savedRegistrations.length)
					await tx`INSERT INTO registrations ${tx(savedRegistrations)}`;
				await tx`UPDATE settings SET ${tx(settings, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
				await tx`DELETE FROM action_logs WHERE actor_login IN (${name},${name + '_admin'})`;
				await tx`DELETE FROM whitelist WHERE login=${name}`;
				await tx`DELETE FROM users WHERE login IN (${name},${name + '_admin'})`;
			});
		}
	};
}
async function live(page: Page, path: string) {
	const opened = page.waitForResponse(
		(response) => new URL(response.url()).pathname === '/api/stream' && response.status() === 200
	);
	await page.goto(path);
	const response = await opened;
	expect(response.headers()['content-type']).toContain('text/event-stream');
	expect(response.headers()['cache-control']).toBe('no-cache');
	expect(response.headers()['x-accel-buffering']).toBe('no');
	await page.evaluate(() => {
		document.documentElement.dataset.m9Document = 'unchanged';
	});
}
async function post(request: APIRequestContext, path: string, form: Record<string, string>) {
	expect((await request.post(path, { form, headers: { origin }, maxRedirects: 0 })).status()).toBe(
		200
	);
}
test(
	'activates a week in a second browser, refreshes admin and logs, and opens the user dialog without reloading',
	{ tag: '@shared-db' },
	async ({ page, browser }) => {
		const context = await browser.newContext();
		const fixture = await setup(page.request, context.request);
		try {
			const admin = await context.newPage(),
				logs = await context.newPage();
			await live(page, '/calendar');
			await live(admin, '/admin');
			const panel = admin.locator('.settings-panel');
			if (await panel.locator(':scope > summary').isVisible())
				await panel.locator(':scope > summary').click();
			await live(logs, '/admin/logs');
			const logsRefresh = logs.waitForResponse(
				(response) => new URL(response.url()).pathname === '/admin/logs/__data.json'
			);
			await post(context.request, '/admin?/setActiveWeek', { week: '2' });
			await logsRefresh;
			await expect(
				page
					.getByRole('dialog', { name: 'La settimana 2 è stata attivata!' })
					.getByRole('button', { name: 'OK', exact: true })
			).toBeVisible();
			await expect(page.getByRole('heading', { name: 'Settimana 2', exact: true })).toBeVisible();
			await expect(
				page.getByRole('article', { name: fixture.name + '_next', exact: true })
			).toBeVisible();
			await expect(admin.getByLabel('Settimana da attivare', { exact: true })).toHaveValue('2');
			await admin
				.getByRole('spinbutton', { name: 'Limite eventi per utente e settimana', exact: true })
				.fill('3');
			await admin.getByRole('button', { name: 'Salva limite', exact: true }).click();
			await expect(admin.getByRole('status')).toContainText('Impostazioni salvate');
			await post(context.request, '/admin?/setMaxEvents', { maxEvents: '4' });
			await post(context.request, '/admin?/addParticipant', {
				id: String(fixture.id),
				login: fixture.name
			});
			await expect(
				admin.getByRole('spinbutton', { name: 'Limite eventi per utente e settimana', exact: true })
			).toHaveValue('4');
			await expect(admin.getByRole('status')).toContainText('Impostazioni salvate');
			for (const view of [page, admin, logs])
				await expect(view.locator('html')).toHaveAttribute('data-m9-document', 'unchanged');
			await page.goto('/profile');
			await post(context.request, '/admin?/setActiveWeek', { week: '3' });
			await expect(page.getByRole('dialog')).toHaveCount(0);
		} finally {
			await context.close();
			await page.goto('/');
			await fixture.cleanup();
		}
	}
);
test(
	'updates user and public display counts and present logins through token-scoped streams',
	{ tag: '@shared-db' },
	async ({ page, browser }) => {
		const admin = await browser.newContext(),
			publicContext = await browser.newContext();
		const fixture = await setup(page.request, admin.request);
		try {
			const display = await publicContext.newPage();
			await live(page, '/calendar');
			const tokenRequest = display.waitForRequest(
				(request) => new URL(request.url()).pathname === '/api/stream'
			);
			await live(display, '/display?token=m9_public_marker');
			expect(new URL((await tokenRequest).url()).searchParams.get('token')).toBe(
				'm9_public_marker'
			);
			const card = page.getByRole('article', { name: fixture.name, exact: true });
			const screen = display.getByRole('article', { name: fixture.name, exact: true });
			await expect(screen).toContainText('2 posti liberi');
			await post(admin.request, '/admin?/addParticipant', {
				id: String(fixture.id),
				login: fixture.name
			});
			await expect(card).toContainText('1/2');
			await expect(screen).toContainText('1 posti liberi');
			await expect(screen.getByRole('listitem')).toHaveText('@' + fixture.name);
			await post(admin.request, '/admin?/setAttendance', {
				id: String(fixture.id),
				login: fixture.name,
				attended: 'false'
			});
			await expect(screen.getByRole('listitem')).toHaveCount(0);
			await expect(screen).toContainText('1 posti liberi');
			await expect(card).toContainText('1/2');
			for (const view of [page, display])
				await expect(view.locator('html')).toHaveAttribute('data-m9-document', 'unchanged');
			await expect(display.locator('header,nav,form,button,a')).toHaveCount(0);
		} finally {
			await publicContext.close();
			await admin.close();
			await page.goto('/');
			await fixture.cleanup();
		}
	}
);
test(
	'recovers changes missed while disconnected when the native stream reopens',
	{ tag: '@shared-db' },
	async ({ page, browser }) => {
		const admin = await browser.newContext();
		const fixture = await setup(page.request, admin.request);
		try {
			let attempts = 0;
			await page.route('**/api/stream', async (route) => {
				attempts++;
				if (attempts === 1)
					await route.fulfill({
						status: 200,
						contentType: 'text/event-stream',
						body: 'retry: 10\n\n'
					});
				else {
					if (attempts === 2)
						await post(admin.request, '/admin?/addParticipant', {
							id: String(fixture.id),
							login: fixture.name
						});
					await route.continue();
				}
			});
			const connected = page.waitForResponse(
				(response) =>
					new URL(response.url()).pathname === '/api/stream' &&
					response.headers()['x-accel-buffering'] === 'no'
			);
			await page.goto('/calendar');
			await connected;
			expect(attempts).toBeGreaterThanOrEqual(2);
			await expect(page.getByRole('article', { name: fixture.name, exact: true })).toContainText(
				'1/2'
			);
		} finally {
			await page.unrouteAll({ behavior: 'wait' });
			await admin.close();
			await page.goto('/');
			await fixture.cleanup();
		}
	}
);

test(
	'refreshes the display after 60 seconds and stops the interval on navigation',
	{ tag: '@shared-db' },
	async ({ page, browser }) => {
		const admin = await browser.newContext();
		const fixture = await setup(page.request, admin.request);
		try {
			await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
			await page.clock.pauseAt(new Date('2030-01-01T01:00:00Z'));
			await live(page, '/display');
			let reloads = 0;
			page.on('request', (request) => {
				if (new URL(request.url()).pathname === '/display/__data.json') reloads++;
			});
			await page.clock.runFor(59999);
			expect(reloads).toBe(0);
			const refreshed = page.waitForResponse(
				(response) => new URL(response.url()).pathname === '/display/__data.json'
			);
			await page.clock.runFor(1);
			await refreshed;
			expect(reloads).toBe(1);
			await page.goto('/profile');
			await page.clock.runFor(60000);
			expect(reloads).toBe(1);
		} finally {
			await admin.close();
			await page.goto('/');
			await fixture.cleanup();
		}
	}
);
