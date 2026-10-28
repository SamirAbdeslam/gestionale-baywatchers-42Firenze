import { loginPattern } from '../auth/guards.ts';
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import type { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { createSession, invalidateSession } from '../auth/session.ts';
import type { Profile } from '../auth/oauth42.ts';
import { audit, type RequestInfo } from './audit.ts';
import { publish } from '../realtime/bus.ts';

export const devLoginSchema = z.discriminatedUnion('mode', [
	z.object({ mode: z.literal('existing'), userId: z.coerce.number().int().positive() }),
	z.object({
		mode: z.literal('create'),
		login: z.string().trim().toLowerCase().regex(loginPattern),
		admin: z.enum(['on']).optional()
	})
]);
type LoginInput = { profile: Profile } | { dev: z.infer<typeof devLoginSchema> };
export async function login(
	database: typeof db,
	input: LoginInput,
	info: RequestInfo,
	now: Date,
	oldToken?: string
) {
	const result = await database.transaction(async (tx) => {
		let user;
		if ('profile' in input) {
			[user] = await tx
				.insert(users)
				.values({ ...input.profile, lastLoginAt: now })
				.onConflictDoUpdate({ target: users.intraId, set: { ...input.profile, lastLoginAt: now } })
				.returning();
		} else if (input.dev.mode === 'existing') {
			[user] = await tx.select().from(users).where(eq(users.id, input.dev.userId)).for('update');
			if (!user) error(400, m.error_invalid_input());
			await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
		} else {
			// Synthetic negative IDs cannot collide with positive IDs returned by 42.
			[user] = await tx
				.insert(users)
				.values({
					intraId: randomInt(-2147483647, -1),
					login: input.dev.login,
					displayName: input.dev.login,
					role: input.dev.admin ? 'admin' : 'user',
					lastLoginAt: now
				})
				.onConflictDoNothing({ target: users.login })
				.returning();
			if (!user) error(400, m.error_invalid_input());
		}
		if (oldToken) await invalidateSession(tx, oldToken);
		const session = await createSession(tx, user.id, now);
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'LOGIN',
			description: 'dev' in input ? 'Dev login' : 'Login 42'
		});
		return { ...session, logId };
	});
	publish({ type: 'log_created', id: result.logId });
	return result;
}
