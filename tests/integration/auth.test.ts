import assert from 'node:assert/strict';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeEach, expect, it } from 'vitest';
import {
	createSession,
	validateSession,
	invalidateSession,
	SESSION_DURATION,
	sessionId
} from '../../src/lib/server/auth/session.ts';
import { login } from '../../src/lib/server/domain/auth.ts';
import { profileSchema } from '../../src/lib/server/auth/oauth42.ts';
import { subscribe } from '../../src/lib/server/realtime/bus.ts';
import * as schema from '../../src/lib/server/db/schema.ts';
import { audit } from '../../src/lib/server/domain/audit.ts';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { onnotice: () => {} }),
	database = drizzle(client, { schema });
const now = new Date('2026-10-16T12:00:00Z');
const info = { ipAddress: '127.0.0.1', userAgent: 'x'.repeat(250) };
beforeEach(async () => {
	await client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
});
afterAll(async () => {
	await client`TRUNCATE users,events,registrations,week_templates,template_events,whitelist,action_logs RESTART IDENTITY CASCADE`;
	await client.end();
});
it('expires sessions exactly at the deadline and renews only below 15 days', async () => {
	const [user] = await client`INSERT INTO users(intra_id,login) VALUES (1,'student') RETURNING id`;
	const session = await createSession(database, user.id, now);
	expect((await client`SELECT id FROM sessions`)[0].id).toBe(sessionId(session.token));
	expect(
		(await validateSession(database, session.token, new Date(now.getTime() + SESSION_DURATION / 2)))
			?.expiresAt
	).toEqual(session.expiresAt);
	const renewed = await validateSession(
		database,
		session.token,
		new Date(now.getTime() + SESSION_DURATION / 2 + 1)
	);
	expect(renewed?.expiresAt.getTime()).toBe(now.getTime() + SESSION_DURATION * 1.5 + 1);
	await client`UPDATE users SET role='admin' WHERE id=${user.id}`;
	expect((await validateSession(database, session.token, now))?.user.role).toBe('admin');
	await client`UPDATE users SET role='user' WHERE id=${user.id}`;
	expect((await validateSession(database, session.token, now))?.user.role).toBe('user');
	expect(await validateSession(database, session.token, renewed!.expiresAt)).toBeNull();
	expect(await client`SELECT * FROM sessions`).toHaveLength(0);
	expect(await validateSession(database, 'invalid', now)).toBeNull();
});
it('upserts identities, recomputes roles, rotates sessions and commits exactly one audit per login', async () => {
	const listenerEvents: unknown[] = [];
	const unsubscribe = subscribe((event) => listenerEvents.push(event));
	try {
		const admin = profileSchema.parse({ id: 42, login: 'Student', 'staff?': true, wallet: 100 });
		const first = await login(database, { profile: admin }, info, now);
		const second = await login(
			database,
			{ profile: { ...admin, login: 'renamed', role: 'user', wallet: 200 } },
			info,
			now,
			first.token
		);
		expect(await client`SELECT * FROM users`).toHaveLength(1);
		expect(await validateSession(database, first.token, now)).toBeNull();
		expect((await validateSession(database, second.token, now))?.user).toMatchObject({
			login: 'renamed',
			wallet: 200,
			role: 'user'
		});
		const logs =
			await client`SELECT action_type,actor_login,length(user_agent)::int AS length FROM action_logs ORDER BY id`;
		expect(logs).toEqual([
			{ action_type: 'LOGIN', actor_login: 'student', length: 200 },
			{ action_type: 'LOGIN', actor_login: 'renamed', length: 200 }
		]);
		expect(listenerEvents).toEqual([
			{ type: 'log_created', id: 1 },
			{ type: 'log_created', id: 2 }
		]);
		await invalidateSession(database, second.token);
		expect(await validateSession(database, second.token, now)).toBeNull();
	} finally {
		unsubscribe();
	}
});
it('creates dev users without whitelisting or colliding with real identities', async () => {
	const session = await login(
		database,
		{ dev: { mode: 'create', login: 'dev_new', admin: 'on' } },
		info,
		now
	);
	expect((await validateSession(database, session.token, now))?.user.role).toBe('admin');
	expect((await client`SELECT intra_id FROM users`)[0].intra_id).toBeLessThan(0);
	expect(await client`SELECT * FROM whitelist`).toHaveLength(0);
	expect((await client`SELECT description FROM action_logs`)[0].description).toBe('Dev login');
	const [user] = await client`SELECT id FROM users`;
	await login(database, { dev: { mode: 'existing', userId: user.id } }, info, now);
	expect(await client`SELECT * FROM users`).toHaveLength(1);
});
it('rolls back session and user writes if audit fails, without publishing', async () => {
	const events: unknown[] = [];
	const unsubscribe = subscribe((event) => events.push(event));
	await client`ALTER TABLE action_logs ADD CONSTRAINT test_reject_login CHECK (action_type <> 'LOGIN')`;
	try {
		await expect(
			login(database, { profile: profileSchema.parse({ id: 42, login: 'student' }) }, info, now)
		).rejects.toThrow();
		expect(await client`SELECT * FROM users`).toHaveLength(0);
		expect(await client`SELECT * FROM sessions`).toHaveLength(0);
		expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
		expect(events).toHaveLength(0);
	} finally {
		unsubscribe();
		await client`ALTER TABLE action_logs DROP CONSTRAINT test_reject_login`;
	}
});
it('rejects nonexistent dev users and invalid audit action types', async () => {
	await expect(
		login(database, { dev: { mode: 'existing', userId: 123 } }, info, now)
	).rejects.toThrow();
	await expect(
		database.transaction((tx) =>
			audit(tx, {
				...info,
				actor: { id: 1, login: 'none' },
				actionType: 'INVALID' as 'LOGIN',
				description: 'test'
			})
		)
	).rejects.toThrow();
	expect(await client`SELECT * FROM action_logs`).toHaveLength(0);
});
