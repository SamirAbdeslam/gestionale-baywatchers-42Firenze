import { z } from 'zod';
import { readEnv } from '../env.ts';
import { TOKEN_URL } from './oauth42.ts';

const tokenSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().int().positive()
});
let cached: { value: string; expiresAt: number } | undefined;
let pending: Promise<string> | undefined;

export async function getAppToken(): Promise<string | undefined> {
	const { FT_CLIENT_ID, FT_CLIENT_SECRET } = readEnv();
	if (!FT_CLIENT_ID || !FT_CLIENT_SECRET) return undefined;
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	if (pending) return pending;
	pending = (async () => {
		const response = await fetch(TOKEN_URL, {
			method: 'POST',
			redirect: 'error',
			signal: AbortSignal.timeout(10000),
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: FT_CLIENT_ID,
				client_secret: FT_CLIENT_SECRET
			})
		});
		if (!response.ok) throw new Error('Application token request failed');
		const token = tokenSchema.parse(await response.json());
		cached = { value: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
		return token.access_token;
	})();
	try {
		return await pending;
	} finally {
		pending = undefined;
	}
}

export function invalidateAppToken(value: string) {
	// A late 401 for an older token must not discard a token another request just renewed.
	if (cached?.value === value) cached = undefined;
}
