import Database from 'better-sqlite3';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { readEnv } from '../src/lib/server/env.ts';
import { cliArgs, isMain } from './legacy/cli.ts';
import { prepareImport, readLegacy, type ImportData } from './legacy/data.ts';

const tables = [
	'users',
	'events',
	'registrations',
	'week_templates',
	'template_events',
	'whitelist',
	'action_logs'
] as const;
export async function writeData(tx: TransactionSql, prepared: ImportData, dryRun = false) {
	for (const table of tables) {
		const rows = prepared.data[table];
		for (const row of rows) {
			const values = Object.fromEntries(
				Object.entries(row).map(([column, value]) => {
					// Force text before casting: postgres.js otherwise drops Python microseconds via Date.
					if (['created_at', 'registered_at', 'added_at'].includes(column))
						return [column, tx`${tx.typed(value, 25)}::timestamptz`];
					if (column === 'old_value' || column === 'new_value')
						return [column, value === null ? null : tx.json(value as postgres.JSONValue)];
					return [column, value];
				})
			);
			await tx`INSERT INTO ${tx(table)} ${tx(values)}`;
		}
	}
	await tx`INSERT INTO settings ${tx(prepared.settings)} ON CONFLICT (id) DO UPDATE SET ${tx(prepared.settings)}, updated_at = now()`;
	// setval is not rolled back by PostgreSQL; dry runs must leave sequences untouched.
	if (!dryRun)
		for (const table of tables)
			await tx`SELECT setval(pg_get_serial_sequence(${table}, 'id'), coalesce((SELECT max(id) FROM ${tx(table)}), 1), (SELECT count(*) > 0 FROM ${tx(table)}))`;
}
export async function importLegacy(
	client: Sql,
	sqlite: string,
	options: { dryRun?: boolean; forceEmpty?: boolean; confirm?: () => Promise<string> } = {}
) {
	const source = new Database(sqlite, { readonly: true, fileMustExist: true });
	let prepared: ImportData;
	try {
		const ignored = Object.fromEntries(
			['push_subscriptions', 'scheduled_notifications', 'user_notification_preferences'].map(
				(table) => [
					table,
					(source.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
				]
			)
		);
		prepared = prepareImport(readLegacy(source), ignored);
	} finally {
		source.close();
	}
	if (options.forceEmpty && (await options.confirm?.()) !== 'yes')
		throw new Error('Destructive import requires interactive confirmation: yes');
	const rollback = new Error('dry run rollback');
	try {
		await client.begin(async (tx) => {
			await tx`LOCK TABLE users, events, registrations, week_templates, template_events, whitelist, action_logs IN ACCESS EXCLUSIVE MODE`;
			let nonempty = false;
			for (const table of tables) {
				const [row] = await tx`SELECT EXISTS(SELECT 1 FROM ${tx(table)}) AS occupied`;
				nonempty ||= row.occupied;
			}
			if (nonempty && !options.forceEmpty)
				throw new Error(
					'Destination is not empty; use --force-empty with interactive confirmation'
				);
			if (options.forceEmpty)
				await tx`TRUNCATE users, events, registrations, week_templates, template_events, whitelist, action_logs CASCADE`;
			await writeData(tx, prepared, options.dryRun);
			if (options.dryRun) throw rollback;
		});
	} catch (error) {
		if (error !== rollback) throw error;
	}
	return prepared.report;
}
if (isMain(import.meta.url)) {
	const args = z
		.object({
			sqlite: z.string().min(1),
			'dry-run': z.boolean().default(false),
			'force-empty': z.boolean().default(false),
			report: z.string().min(1).optional()
		})
		.parse(
			cliArgs({
				sqlite: { type: 'string' },
				'dry-run': { type: 'boolean' },
				'force-empty': { type: 'boolean' },
				report: { type: 'string' }
			})
		);
	const client = postgres(readEnv().DATABASE_URL, { onnotice: () => {} });
	try {
		const report = await importLegacy(client, args.sqlite, {
			dryRun: args['dry-run'],
			forceEmpty: args['force-empty'],
			confirm: async () => {
				const prompt = createInterface({ input: process.stdin, output: process.stdout });
				try {
					return await prompt.question('Delete destination data? Type yes: ');
				} finally {
					prompt.close();
				}
			}
		});
		const output = JSON.stringify(report, null, 2);
		if (args.report) await writeFile(args.report, output + '\n');
		console.log(output);
	} finally {
		await client.end();
	}
}
