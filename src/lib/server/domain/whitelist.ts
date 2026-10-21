import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { whitelist } from '../db/schema.ts';
import { assertAdmin, lockAdmin, loginPattern } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { digits } from './dates.ts';
import { m } from '#lib/paraglide/messages.js';

export type WhitelistNotice = {
	type: 'success' | 'warning';
	key: 'whitelist_added' | 'whitelist_duplicates' | 'whitelist_invalid' | 'whitelist_removed';
	params: { logins: string };
};
const addSchema = z.strictObject({
	logins: z
		.string()
		.max(5000)
		.trim()
		.min(1)
		.refine((value) => /[^,\s]/.test(value))
});
const removeSchema = z.strictObject({
	id: digits(10).pipe(z.number().int().positive().max(2147483647))
});

export async function listWhitelist(database: typeof db, actor: User | null) {
	assertAdmin(actor);
	return database.select().from(whitelist).orderBy(whitelist.login);
}

export async function addLogins(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { logins } = addSchema.parse(input);
	const tokens = logins
		.toLowerCase()
		.split(/[,\s]+/)
		.filter(Boolean);
	const invalid = new Set<string>(),
		valid = new Set<string>();
	for (const login of tokens) (loginPattern.test(login) ? valid : invalid).add(login);
	const { added, duplicates, logIds } = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const added: string[] = [],
			duplicates: string[] = [],
			logIds: number[] = [];
		// A fixed order also prevents conflicts between overlapping concurrent batches.
		for (const login of [...valid].sort()) {
			const [row] = await tx
				.insert(whitelist)
				.values({ login, addedAt: now })
				.onConflictDoNothing()
				.returning();
			if (!row) {
				duplicates.push(login);
				continue;
			}
			added.push(login);
			logIds.push(
				await audit(tx, {
					...info,
					actor: user,
					actionType: 'WHITELIST_ADD',
					description: `Aggiunto '${login}' alla whitelist.`,
					resourceType: 'whitelist',
					resourceId: String(row.id),
					newValue: login
				})
			);
		}
		return { added, duplicates, logIds };
	});
	for (const id of logIds) publish({ type: 'log_created', id });
	const messages: WhitelistNotice[] = [];
	if (added.length)
		messages.push({
			type: 'success',
			key: 'whitelist_added',
			params: { logins: added.join(', ') }
		});
	if (duplicates.length)
		messages.push({
			type: 'warning',
			key: 'whitelist_duplicates',
			params: { logins: duplicates.join(', ') }
		});
	if (invalid.size)
		messages.push({
			type: 'warning',
			key: 'whitelist_invalid',
			params: { logins: [...invalid].join(', ') }
		});
	return { ok: added.length > 0, messages };
}

export async function removeLogin(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo
) {
	assertAdmin(actor);
	const { id } = removeSchema.parse(input);
	const { row, logId } = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [row] = await tx.delete(whitelist).where(eq(whitelist.id, id)).returning();
		if (!row) error(404, m.error_whitelist_not_found());
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'WHITELIST_REMOVE',
			description: `Rimosso '${row.login}' dalla whitelist.`,
			resourceType: 'whitelist',
			resourceId: String(row.id),
			oldValue: row.login
		});
		return { row, logId };
	});
	publish({ type: 'log_created', id: logId });
	const messages: WhitelistNotice[] = [
		{ type: 'success', key: 'whitelist_removed', params: { logins: row.login } }
	];
	return { ok: true, messages };
}
