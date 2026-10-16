import postgres, { type Sql } from 'postgres';
import { z } from 'zod';
import { readEnv } from '../src/lib/server/env.ts';
import { addDays } from '../src/lib/server/domain/dates.ts';
import { makeRows } from './legacy/fixtures.ts';
import { prepareImport } from './legacy/data.ts';
import { writeData } from './import-legacy.ts';
import { cliArgs, isMain } from './legacy/cli.ts';

export function seedData(seed: number, now: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Rome',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
	const today = `${p.year}-${p.month}-${p.day}`;
	const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
	const rows = makeRows(seed, addDays(today, 1 - weekday));
	const renames = new Map([
		[rows.users[0].login, 'dev_admin'],
		[rows.users[3].login, 'dev_user'],
		[rows.users[40].login, 'dev_outsider']
	]);
	for (const user of rows.users) user.login = renames.get(user.login) ?? user.login;
	for (const row of rows.registrations)
		row.participant_name = renames.get(row.participant_name.toLowerCase()) ?? row.participant_name;
	for (const row of rows.action_logs) row.username = renames.get(row.username) ?? row.username;
	for (const row of rows.baywatcher_whitelist)
		row.intra_login = renames.get(row.intra_login) ?? row.intra_login;
	rows.settings.find((r) => r.key === 'active_week')!.value = '1';
	rows.settings.find((r) => r.key === 'display_week')!.value = '1';
	return prepareImport(rows);
}
export async function seedDatabase(client: Sql, seed = 42, now = new Date()) {
	const data = seedData(seed, now);
	await client.begin(async (tx) => {
		await tx`TRUNCATE users, events, registrations, week_templates, template_events, whitelist, action_logs CASCADE`;
		await writeData(tx, data);
	});
	return { users: data.data.users.length, events: data.data.events.length };
}
if (isMain(import.meta.url)) {
	const args = z
		.object({ seed: z.coerce.number().int().default(42) })
		.parse(cliArgs({ seed: { type: 'string' } }));
	const client = postgres(readEnv().DATABASE_URL);
	try {
		console.log(JSON.stringify(await seedDatabase(client, args.seed)));
	} finally {
		await client.end();
	}
}
