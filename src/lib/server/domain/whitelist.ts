import { error } from '@sveltejs/kit';
import { eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Transaction } from '../db/index.ts';
import type { db } from '../db/index.ts';
import { users, whitelist } from '../db/schema.ts';
import { assertAdmin, lockAdmin, loginPattern } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';
import { lookupIntraLogins } from '../intra.ts';
import { digits } from './dates.ts';
import { m } from '#lib/paraglide/messages.js';

export type WhitelistNotice = {
	type: 'success' | 'warning' | 'error';
	key:
		| 'whitelist_added'
		| 'whitelist_duplicates'
		| 'whitelist_invalid'
		| 'whitelist_removed'
		| 'whitelist_not_found'
		| 'whitelist_other_campus'
		| 'whitelist_unavailable';
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
	// Only new logins are checked on Intra (existing ones are reported as duplicates).
	const sorted = [...valid].sort();
	const existing = sorted.length
		? new Set(
				(
					await database
						.select({ login: whitelist.login })
						.from(whitelist)
						.where(inArray(whitelist.login, sorted))
				).map((row) => row.login)
			)
		: new Set<string>();
	const lookups = await lookupIntraLogins(sorted.filter((login) => !existing.has(login)));
	const rejected = (status: string) =>
		[...lookups].filter(([, result]) => result === status).map(([login]) => login);
	const { added, duplicates, logIds } = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const added: string[] = [],
			duplicates: string[] = [],
			logIds: number[] = [];
		// A fixed order also prevents conflicts between overlapping concurrent batches.
		for (const login of sorted) {
			if (lookups.has(login) && lookups.get(login) !== 'ok') continue;
			const inserted = await insertWhitelistLogin(tx, user, login, null, info, now);
			if (!inserted) duplicates.push(login);
			else {
				added.push(login);
				logIds.push(inserted.logId);
			}
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
	for (const [status, key] of [
		['missing', 'whitelist_not_found'],
		['other_campus', 'whitelist_other_campus'],
		['unavailable', 'whitelist_unavailable']
	] as const) {
		const logins = rejected(status);
		if (logins.length)
			messages.push({
				type: status === 'unavailable' ? 'error' : 'warning',
				key,
				params: { logins: logins.join(', ') }
			});
	}
	return { ok: added.length > 0, messages };
}

export async function suggestLogins(database: typeof db, actor: User | null, query: string) {
	assertAdmin(actor);
	const q = query.trim().toLowerCase();
	if (!loginPattern.test(q)) return [];
	const pattern = q.replace(/[\\%_]/g, '\\$&');
	return database
		.select({
			login: whitelist.login,
			name: users.displayName,
			hasImage: sql<boolean>`${users.imageUrl} is not null and ${users.imageUrl} <> ''`
		})
		.from(whitelist)
		.leftJoin(users, eq(users.login, whitelist.login))
		.where(or(ilike(whitelist.login, `%${pattern}%`), ilike(users.displayName, `%${pattern}%`)))
		.orderBy(sql`${whitelist.login} not ilike ${pattern + '%'}`, whitelist.login)
		.limit(8);
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
			description: `Removed '${row.login}' from the whitelist.`,
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

export async function insertWhitelistLogin(
	tx: Transaction,
	actor: User,
	login: string,
	weeks: number[] | null,
	info: RequestInfo,
	now: Date
) {
	const insert = tx.insert(whitelist).values({ login, weeks, addedAt: now });
	const [row] = await (
		weeks
			? insert.onConflictDoUpdate({ target: whitelist.login, set: { weeks } })
			: insert.onConflictDoNothing()
	).returning();
	if (!row) return null;
	const logId = await audit(tx, {
		...info,
		actor,
		actionType: 'WHITELIST_ADD',
		description: `Added '${login}' to the whitelist.`,
		resourceType: 'whitelist',
		resourceId: String(row.id),
		newValue: weeks ? { login, weeks } : login
	});
	return { row, logId };
}
