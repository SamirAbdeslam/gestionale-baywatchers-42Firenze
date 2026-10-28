import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import postgres, { type Sql } from 'postgres';
import { z } from 'zod';
import { participantTotals, type AttendanceRow } from '../src/lib/server/domain/reports.ts';
import { readEnv } from '../src/lib/server/env.ts';
import { cliArgs, isMain } from './legacy/cli.ts';

export async function verifyImport(client: Sql, path: string) {
	const db = new Database(path, { readonly: true, fileMustExist: true });
	try {
		for (const [legacy, target, count] of [
			['users', 'users', 'count(*)'],
			['baywatcher_whitelist', 'whitelist', 'count(DISTINCT lower(trim(intra_login)))'],
			['week_templates', 'week_templates', 'count(*)']
		]) {
			const expected = (db.prepare(`SELECT ${count} AS n FROM ${legacy}`).get() as { n: number }).n;
			const [actual] = await client`SELECT count(*)::int AS n FROM ${client(target)}`;
			assert.equal(actual.n, expected, `${target} count`);
		}
		const imported = await client<
			{ id: number; registrations: number }[]
		>`SELECT e.id, count(r.id)::int AS registrations FROM events e LEFT JOIN registrations r ON r.event_id=e.id GROUP BY e.id ORDER BY e.id`;
		for (const event of imported) {
			const expected = db
				.prepare(
					'SELECT count(DISTINCT lower(trim(participant_name))) AS n FROM registrations WHERE event_id=?'
				)
				.get(event.id) as { n: number };
			assert.equal(event.registrations, expected.n, `event ${event.id} registrations`);
		}
		// Independent SQLite aggregation deliberately avoids the import's normalization helpers.
		const expected = db
			.prepare(
				`
   WITH ranked AS (
    SELECT *, lower(trim(participant_name)) AS login,
      row_number() OVER (PARTITION BY event_id, lower(trim(participant_name)) ORDER BY registration_date, id) AS position
    FROM registrations WHERE event_id IN (SELECT value FROM json_each(?))
   )
   SELECT r.login, sum(CASE WHEN attended = 1 THEN 1 ELSE 0 END) AS events,
    round(sum(CASE WHEN attended = 1 THEN
     (cast(substr(end_time,1,instr(end_time,':')-1) AS integer)*60 + cast(substr(end_time,instr(end_time,':')+1,2) AS integer)
     -cast(substr(start_time,1,instr(start_time,':')-1) AS integer)*60 - cast(substr(start_time,instr(start_time,':')+1,2) AS integer)) ELSE 0 END)/60.0, 2) AS hours,
    sum(CASE WHEN attended = 1 THEN compensation ELSE 0 END) AS altarian
   FROM ranked r JOIN events e ON e.id = r.event_id WHERE position=1 GROUP BY r.login
  `
			)
			.all(JSON.stringify(imported.map((e) => e.id))) as {
			login: string;
			events: number;
			hours: number;
			altarian: number;
		}[];
		const rows = await client<
			AttendanceRow[]
		>`SELECT r.participant_login AS "participantLogin", r.attended, e.start_time AS "startTime", e.end_time AS "endTime", e.compensation FROM registrations r JOIN events e ON e.id=r.event_id`;
		assert.deepEqual(
			participantTotals(rows),
			expected.sort((a, b) => a.login.localeCompare(b.login)),
			'participant hours and Altarian'
		);
		return { events: imported.length, participants: expected.length, status: 'ok' };
	} finally {
		db.close();
	}
}
if (isMain(import.meta.url)) {
	const args = z
		.object({ sqlite: z.string().min(1) })
		.parse(cliArgs({ sqlite: { type: 'string' } }));
	const client = postgres(readEnv().DATABASE_URL);
	try {
		console.log(JSON.stringify(await verifyImport(client, args.sqlite)));
	} finally {
		await client.end();
	}
}
