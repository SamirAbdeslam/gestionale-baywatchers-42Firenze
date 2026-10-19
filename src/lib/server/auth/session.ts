import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import type { Database } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';

export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
export type User = Pick<
	typeof users.$inferSelect,
	'id' | 'login' | 'displayName' | 'imageUrl' | 'wallet' | 'role'
>;
export function generateSessionToken(): string {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
	let value = 0,
		bits = 0,
		token = '';
	for (const byte of randomBytes(20)) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			token += alphabet[(value >>> bits) & 31];
		}
	}
	return token;
}
export function sessionId(token: string) {
	return createHash('sha256').update(token).digest('hex');
}
export const cookieOptions = (origin: string) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: origin.startsWith('https://')
});
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date, origin: string) {
	cookies.set('session', token, { ...cookieOptions(origin), expires: expiresAt });
}
export async function createSession(database: Database, userId: number, now: Date) {
	const token = generateSessionToken(),
		expiresAt = new Date(now.getTime() + SESSION_DURATION);
	await database.insert(sessions).values({ id: sessionId(token), userId, expiresAt });
	return { token, expiresAt };
}
export async function invalidateSession(database: Database, token: string) {
	await database.delete(sessions).where(eq(sessions.id, sessionId(token)));
}
export async function validateSession(database: Database, token: string, now: Date) {
	if (!/^[a-z2-7]{32}$/.test(token)) return null;
	const [row] = await database
		.select({
			id: sessions.id,
			expiresAt: sessions.expiresAt,
			user: {
				id: users.id,
				login: users.login,
				displayName: users.displayName,
				imageUrl: users.imageUrl,
				wallet: users.wallet,
				role: users.role
			}
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, sessionId(token)));
	if (!row) return null;
	if (row.expiresAt.getTime() <= now.getTime()) {
		await invalidateSession(database, token);
		return null;
	}
	if (row.expiresAt.getTime() - now.getTime() < SESSION_DURATION / 2) {
		const expiresAt = new Date(now.getTime() + SESSION_DURATION);
		const [renewed] = await database
			.update(sessions)
			.set({ expiresAt })
			.where(and(eq(sessions.id, row.id), gt(sessions.expiresAt, now)))
			.returning({ id: sessions.id });
		if (!renewed) return null;
		row.expiresAt = expiresAt;
	}
	return { user: row.user, expiresAt: row.expiresAt };
}
