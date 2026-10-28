import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { makeRows } from './fixtures.ts';
import { cliArgs, isMain } from './cli.ts';

export function makeFakeDb(path: string, seed = 42) {
	// Refuse overwrites: an output typo must not replace a real legacy database.
	const db = new Database(path, { fileMustExist: false });
	try {
		// Python sqlite3 leaves FK enforcement off; legacy audit IDs reference intra_id.
		db.pragma('foreign_keys = OFF');
		if (
			(
				db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as {
					n: number;
				}
			).n !== 0
		)
			throw new Error('Output database is not empty');
		db.transaction(() => {
			db.exec(readFileSync(new URL('./legacy-schema.sql', import.meta.url), 'utf8'));
			const rows = makeRows(seed);
			db.prepare('DELETE FROM settings').run();
			for (const [table, values] of Object.entries(rows)) {
				const columns = Object.keys(values[0]);
				const insert = db.prepare(
					`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((c) => `@${c}`).join(',')})`
				);
				for (const row of values) insert.run(row);
			}
			// BOOLEAN affinity converts the bound string to INTEGER, as approved in SESSIONS.
			db.prepare('UPDATE registrations SET attended = ? WHERE id = 2').run('1');
			db.prepare('INSERT INTO user_notification_preferences(user_id) VALUES (1)').run();
			db.prepare(
				"INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth, created_at) VALUES (1, 'https://example.test/push', 'fake-key', 'fake-auth', '2026-10-01 10:20:30.123456')"
			).run();
			db.prepare(
				"INSERT INTO scheduled_notifications(user_id,event_id,registration_id,notification_type,scheduled_time) VALUES (1,1,1,'24h','2026-10-12 09:00:00.000000')"
			).run();
		})();
	} finally {
		db.close();
	}
}
if (isMain(import.meta.url)) {
	const args = z
		.object({ out: z.string().min(1), seed: z.coerce.number().int().default(42) })
		.parse(cliArgs({ out: { type: 'string' }, seed: { type: 'string' } }));
	makeFakeDb(args.out, args.seed);
	console.log(`Created deterministic legacy fixture: ${args.out}`);
}
