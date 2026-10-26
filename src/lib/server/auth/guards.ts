import { eq } from 'drizzle-orm';
import { users } from '../db/schema.ts';
import type { Transaction } from '../db/index.ts';
import { timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { User } from './session.ts';

export function assertUser(actor: User | null): asserts actor is User {
	if (!actor) error(401, m.error_unauthorized());
}
export function assertAdmin(actor: User | null): asserts actor is User {
	assertUser(actor);
	if (actor.role !== 'admin') error(403, m.error_forbidden());
}
export function matchesPath(path: string, prefix: string) {
	return path === prefix || path.startsWith(`${prefix}/`);
}
export function isPublicPath(path: string) {
	return (
		path === '/' ||
		['/display', '/auth', '/healthz', '/language', '/api/stream', '/_app'].some((prefix) =>
			matchesPath(path, prefix)
		)
	);
}
export function matchesDisplayToken(actual: string | null, expected: string) {
	if (!expected) return true;
	const left = Buffer.from(actual ?? ''),
		right = Buffer.from(expected);
	return left.length === right.length && timingSafeEqual(left, right);
}

export const loginPattern = /^[a-z0-9_-]{1,32}$/;

export async function lockAdmin(tx: Transaction, actor: User) {
	const [user] = await tx.select().from(users).where(eq(users.id, actor.id)).for('update');
	if (!user) error(401, m.error_unauthorized());
	assertAdmin(user);
	return user;
}
