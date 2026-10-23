import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test, type APIRequestContext } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
assert.equal(new URL(databaseUrl).pathname, '/baywatchers_test');
let client: ReturnType<typeof postgres>;
test.beforeAll(() => {
	client = postgres(databaseUrl, { onnotice: () => {} });
});
test.afterAll(() => client.end());
const origin = 'http://localhost:4173';
async function login(request: APIRequestContext, admin = false) {
	const login = `m5_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
	const response = await request.post('/auth/dev', {
		form: { mode: 'create', login, ...(admin ? { admin: 'on' } : {}) },
		headers: { origin, accept: 'text/html' },
		maxRedirects: 0
	});
	expect(response.status()).toBe(303);
	return login;
}
async function fixture(title: string, date = '2099-01-01') {
	const [row] =
		await client`INSERT INTO events (title,week,weekday,event_date,start_time,end_time,max_slots) VALUES (${title},4,1,${date},'09:00','10:00',1) RETURNING id`;
	return row.id as number;
}
async function cleanup(login: string, ids: number[]) {
	await client.begin(async (tx) => {
		if (ids.length) await tx`DELETE FROM events WHERE id IN ${tx(ids)}`;
		await tx`DELETE FROM action_logs WHERE actor_login=${login}`;
		await tx`DELETE FROM whitelist WHERE login=${login}`;
		await tx`DELETE FROM users WHERE login=${login}`;
	});
}

test(
	'user actions enforce whitelist, capacity, weekly limit and ownership, then unregister idempotently',
	{ tag: '@shared-db' },
	async ({ request }) => {
		const name = await login(request);
		const ids: number[] = [];
		const [before] = await client`SELECT * FROM settings WHERE id=1`;
		const post = (action: string, form: Record<string, string>, requestOrigin = origin) =>
			request.post(`/calendar?/${action}`, {
				form,
				headers: { origin: requestOrigin, accept: 'text/html' }
			});
		try {
			await client`UPDATE settings SET max_events_per_user=0 WHERE id=1`;
			const first = await fixture(`M5 user ${name}`);
			ids.push(first);
			const second = await fixture(`M5 second ${name}`);
			ids.push(second);
			expect((await post('register', { id: String(first) })).status()).toBe(403);
			await client`INSERT INTO whitelist (login) VALUES (${name})`;
			expect((await post('register', { id: String(first) }, 'https://evil.example')).status()).toBe(
				403
			);
			expect((await post('register', { id: String(first), login: 'spoofed' })).status()).toBe(400);
			const registered = await post('register', { id: String(first) });
			expect(registered.status()).toBe(200);
			expect(await registered.text()).toContain('Iscrizione completata');
			expect((await post('register', { id: String(first) })).status()).toBe(400);
			await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (${second},'m5_capacity_fixture',false)`;
			const full = await post('register', { id: String(second) });
			expect(full.status()).toBe(400);
			expect(await full.text()).toContain('Non ci sono posti disponibili');
			await client`DELETE FROM registrations WHERE event_id=${second}`;
			await client`UPDATE settings SET max_events_per_user=1 WHERE id=1`;
			const limited = await post('register', { id: String(second) });
			expect(limited.status()).toBe(400);
			expect(await limited.text()).toContain('Hai raggiunto il limite massimo di 1 eventi');
			await client`DELETE FROM whitelist WHERE login=${name}`;
			const removed = await post('unregister', { id: String(first) });
			expect(removed.status()).toBe(200);
			expect(await removed.text()).toContain('Disiscrizione completata');
			expect((await post('unregister', { id: String(first) })).status()).toBe(200);
			expect((await post('unregister', { id: '2147483647' })).status()).toBe(404);
			expect(
				await client`SELECT * FROM registrations WHERE participant_login=${name}`
			).toHaveLength(0);
			expect(
				(
					await client`SELECT action_type FROM action_logs WHERE actor_login=${name} AND action_type<>'LOGIN' ORDER BY id`
				).map((row) => row.action_type)
			).toEqual(['REGISTER_EVENT', 'UNREGISTER_EVENT']);
		} finally {
			await client`UPDATE settings SET ${client(before, 'pool_start', 'pool_end', 'active_week', 'display_week', 'max_events_per_user', 'updated_at')} WHERE id=1`;
			await cleanup(name, ids);
		}
	}
);

for (const javaScriptEnabled of [true, false]) {
	test.describe(`admin participants with JavaScript ${javaScriptEnabled}`, () => {
		test.use({ javaScriptEnabled });
		test(
			'adds beyond capacity, handles duplicate warnings, toggles presence and removes',
			{ tag: '@shared-db' },
			async ({ page }) => {
				const name = await login(page.request, true);
				const ids: number[] = [];
				try {
					const title = `M5 admin ${name}`;
					const id = await fixture(title, '2000-01-01');
					ids.push(id);
					await client`INSERT INTO registrations (event_id,participant_login,attended) VALUES (${id},'m5_existing_fixture',true)`;
					await page.goto('/admin?week=4');
					const article = page.getByRole('article', { name: title, exact: true });
					const external = `external_${name}`;
					await article.getByLabel('Login del partecipante').fill(external.toUpperCase());
					await article.getByRole('button', { name: 'Aggiungi partecipante', exact: true }).click();
					const participant = article.getByRole('listitem').filter({ hasText: external });
					await expect(participant).toBeVisible();
					await expect(article).toContainText('2/1');
					expect(await client`SELECT id FROM users WHERE login=${external}`).toHaveLength(0);
					await article.getByLabel('Login del partecipante').fill(external.toUpperCase());
					await article.getByRole('button', { name: 'Aggiungi partecipante', exact: true }).click();
					await expect(
						page
							.getByRole('status')
							.filter({ hasText: `${external} è già iscritto a questo evento` })
					).toBeVisible();
					await participant.getByRole('button', { name: 'Segna assente', exact: true }).click();
					await expect(
						participant.getByRole('button', { name: 'Segna assente', exact: true })
					).toHaveAttribute('aria-pressed', 'true');
					await expect(article).toContainText('Presenti: 1');
					await expect(
						page.getByRole('status').filter({ hasText: `${external} segnato come NON PARTECIPATO` })
					).toBeVisible();
					await participant.getByRole('button', { name: 'Segna presente', exact: true }).click();
					await expect(
						participant.getByRole('button', { name: 'Segna assente', exact: true })
					).toBeVisible();
					await expect(article).toContainText('Presenti: 2');
					if (javaScriptEnabled) {
						await page.setViewportSize({ width: 360, height: 800 });
						expect(
							await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
						).toBe(true);
					}
					await participant
						.getByRole('button', { name: 'Rimuovi partecipante', exact: true })
						.click();
					await expect(participant).toHaveCount(0);
					const missing = await page.request.post('/admin?/removeParticipant&week=4', {
						form: { id: String(id), login: external },
						headers: { origin, accept: 'text/html' }
					});
					expect(missing.status()).toBe(200);
					expect(await missing.text()).toContain(`${external} non è iscritto a questo evento`);
					expect(
						(
							await client`SELECT action_type FROM action_logs WHERE actor_login=${name} AND action_type<>'LOGIN' ORDER BY id`
						).map((row) => row.action_type)
					).toEqual(['ADMIN_ADD_PARTICIPANT', 'MARK_ABSENT', 'MARK_PRESENT', 'ADMIN_UNREGISTER']);
				} finally {
					await cleanup(name, ids);
				}
			}
		);
	});
}
