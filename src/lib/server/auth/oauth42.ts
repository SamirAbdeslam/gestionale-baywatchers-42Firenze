import { OAuth2Client } from 'arctic';
import { z } from 'zod';
import { ADMIN_LOGINS } from '../admins.ts';

export const AUTHORIZE_URL = 'https://api.intra.42.fr/oauth/authorize';
export const TOKEN_URL = 'https://api.intra.42.fr/oauth/token';
export const PROFILE_URL = 'https://api.intra.42.fr/v2/me';
export function oauthClient(env: {
	FT_CLIENT_ID: string;
	FT_CLIENT_SECRET: string;
	ORIGIN: string;
}) {
	if (!env.FT_CLIENT_ID || !env.FT_CLIENT_SECRET)
		throw new Error('OAuth credentials are not configured');
	return new OAuth2Client(env.FT_CLIENT_ID, env.FT_CLIENT_SECRET, `${env.ORIGIN}/auth/callback`);
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
		image: z.object({ link: z.string().catch('') }).catch({ link: '' }),
		wallet: z.number().int().min(-2147483648).max(2147483647).catch(0),
		'staff?': z.boolean().catch(false)
	})
	.transform((profile) => ({
		intraId: profile.id,
		login: profile.login,
		email: profile.email,
		displayName: profile.displayname ?? profile.login,
		imageUrl: profile.image.link,
		wallet: profile.wallet,
		role:
			profile['staff?'] || ADMIN_LOGINS.some((login) => login.toLowerCase() === profile.login)
				? ('admin' as const)
				: ('user' as const)
	}));
export type Profile = z.infer<typeof profileSchema>;
export async function fetchProfile(client: OAuth2Client, code: string) {
	const tokens = await client.validateAuthorizationCode(TOKEN_URL, code, null);
	const response = await fetch(PROFILE_URL, {
		headers: { Authorization: `Bearer ${tokens.accessToken()}` },
		signal: AbortSignal.timeout(10000)
	});
	if (!response.ok) throw new Error('OAuth profile request failed');
	return profileSchema.parse(await response.json());
}
