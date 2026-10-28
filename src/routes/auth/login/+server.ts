import { sameSiteRedirect } from '#lib/server/auth/guards.ts';
import { redirect } from '@sveltejs/kit';
import { readEnv } from '#lib/server/env.ts';
import { oauthClient, generateState } from '#lib/server/auth/oauth42.ts';
import { cookieOptions } from '#lib/server/auth/session.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ cookies, url }) => {
	const env = readEnv();
	try {
		const state = generateState();
		const authorizationUrl = oauthClient(env).authorizationUrl(state);
		cookies.set('oauth_return_to', sameSiteRedirect(url.searchParams.get('to'), env.ORIGIN), {
			...cookieOptions(env.ORIGIN),
			maxAge: 600
		});
		cookies.set('oauth_state', state, { ...cookieOptions(env.ORIGIN), maxAge: 600 });
		return new Response(null, {
			status: 303,
			headers: { Location: authorizationUrl.href, 'Cache-Control': 'no-store' }
		});
	} catch {
		console.error('OAuth login failed: authorization setup');
		redirect(303, '/?error=login_failed');
	}
};
