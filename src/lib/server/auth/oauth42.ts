import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ADMIN_LOGINS } from '../admins.ts';

export const AUTHORIZE_URL = 'https://api.intra.42.fr/oauth/authorize';
export const TOKEN_URL = 'https://api.intra.42.fr/oauth/token';
export const PROFILE_URL = 'https://api.intra.42.fr/v2/me';
export function generateState() {
	return randomBytes(32).toString('base64url');
}

export function oauthClient(env: {
	FT_CLIENT_ID: string;
	FT_CLIENT_SECRET: string;
	ORIGIN: string;
}) {
	if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET)
		throw new Error('OAuth credentials are not configured');
	const redirectUri = `${env.ORIGIN}/auth/callback`;
	return {
		authorizationUrl(state: string) {
			const url = new URL(AUTHORIZE_URL);
			url.search = new URLSearchParams({
				client_id: env.FT_CLIENT_ID,
				redirect_uri: redirectUri,
				response_type: 'code',
				scope: 'public',
				state
			}).toString();
			return url;
		},
		async accessToken(code: string) {
			const request = new Request(TOKEN_URL, {
				method: 'POST',
				redirect: 'error',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'authorization_code',
					code,
					redirect_uri: redirectUri,
					client_id: env.FT_CLIENT_ID,
					client_secret: env.FT_CLIENT_SECRET
				}),
				signal: AbortSignal.timeout(10000)
			});
			const response = await fetch(request);
			if (!response.ok) throw new Error('OAuth token request failed');
			return z.object({ access_token: z.string().min(1) }).parse(await response.json())
				.access_token;
		}
	};
}
export const profileSchema = z
	.object({
		id: z.number().int().positive().max(2147483647),
		login: z
			.string()
			.trim()
			.toLowerCase()
			.regex(/^[a-z0-9_-]{1,32}$/),
		email: z.string().catch(''),
		displayname: z.string().optional().catch(undefined),
		image: z
			.object({
				link: z.string().catch(''),
				versions: z
					.object({ medium: z.string().optional().catch(undefined) })
					.optional()
					.catch(undefined)
			})
			.catch({ link: '' }),
		wallet: z.number().int().min(-2147483648).max(2147483647).catch(0),
		'staff?': z.boolean().catch(false)
	})
	.transform((profile) => ({
		intraId: profile.id,
		login: profile.login,
		email: profile.email,
		displayName: profile.displayname ?? profile.login,
		imageUrl: profile.image.versions?.medium ?? profile.image.link,
		wallet: profile.wallet,
		role:
			profile['staff?'] || ADMIN_LOGINS.some((login) => login.toLowerCase() === profile.login)
				? ('admin' as const)
				: ('user' as const)
	}));
export type Profile = z.infer<typeof profileSchema>;
export async function fetchProfile(client: ReturnType<typeof oauthClient>, code: string) {
	const accessToken = await client.accessToken(code);
	const response = await fetch(PROFILE_URL, {
		redirect: 'error',
		headers: { Authorization: `Bearer ${accessToken}` },
		signal: AbortSignal.timeout(10000)
	});
	if (!response.ok) throw new Error('OAuth profile request failed');
	return profileSchema.parse(await response.json());
}
