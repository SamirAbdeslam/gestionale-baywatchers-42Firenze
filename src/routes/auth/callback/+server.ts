import { randomUUID, timingSafeEqual } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { readEnv } from '#lib/server/env.ts';
import { oauthClient, fetchProfile } from '#lib/server/auth/oauth42.ts';
import { setSessionCookie } from '#lib/server/auth/session.ts';
import { login } from '#lib/server/domain/auth.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const storedState = event.cookies.get('oauth_state');
	event.cookies.delete('oauth_state', { path: '/' });
	let stage = 'state';
	try {
		const query = z
			.object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(512) })
			.parse(Object.fromEntries(event.url.searchParams));
		const actual = Buffer.from(query.state),
			expected = Buffer.from(storedState ?? '');
		if (!storedState || actual.length !== expected.length || !timingSafeEqual(actual, expected))
			throw new Error('State mismatch');
		const env = readEnv();
		stage = 'token exchange or profile';
		const profile = await fetchProfile(oauthClient(env), query.code);
		stage = 'persistence';
		const { db } = await import('#lib/server/db/index.ts');
		const session = await login(
			db,
			{ profile },
			{ ipAddress: event.getClientAddress(), userAgent: event.request.headers.get('user-agent') },
			new Date(),
			event.cookies.get('session')
		);
		setSessionCookie(event.cookies, session.token, session.expiresAt, env.ORIGIN);
	} catch {
		// Never log request URLs, tokens, provider response bodies or credential-bearing errors.
		console.error('OAuth login failed', { id: randomUUID(), stage });
		redirect(303, '/?error=login_failed');
	}
	redirect(303, '/calendar');
};
