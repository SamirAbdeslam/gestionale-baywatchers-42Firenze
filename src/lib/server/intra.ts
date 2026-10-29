import { z } from 'zod';
import { getAppToken, invalidateAppToken } from './auth/app-token.ts';
import { FIRENZE_CAMPUS_ID, fetchWithRetry } from './auth/oauth42.ts';
import { readEnv } from './env.ts';

export type IntraLookup = 'ok' | 'missing' | 'other_campus' | 'unavailable';
const userSchema = z.object({
	campus_users: z.array(z.object({ campus_id: z.number() })).catch([])
});

/** Checks on the 42 API that a login exists and belongs to the Firenze campus. */
async function lookupIntraLogin(login: string): Promise<IntraLookup> {
	// The local dev login has no 42 credentials to call the API with.
	if (readEnv().AUTH_DEV_LOGIN) return 'ok';
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			const token = await getAppToken();
			if (!token) return 'unavailable';
			const response = await fetchWithRetry(
				new Request(`https://api.intra.42.fr/v2/users/${encodeURIComponent(login)}`, {
					headers: { Authorization: `Bearer ${token}` },
					redirect: 'error',
					signal: AbortSignal.timeout(10000)
				})
			);
			if (response.status === 401 && attempt === 0) {
				await response.body?.cancel();
				invalidateAppToken(token);
				continue;
			}
			if (response.status === 404) {
				await response.body?.cancel();
				return 'missing';
			}
			if (!response.ok) {
				await response.body?.cancel();
				return 'unavailable';
			}
			const { campus_users } = userSchema.parse(await response.json());
			return campus_users.some(({ campus_id }) => campus_id === FIRENZE_CAMPUS_ID)
				? 'ok'
				: 'other_campus';
		}
	} catch {
		// Provider exceptions can contain credential-bearing request details.
		console.error('Intra user lookup failed');
	}
	return 'unavailable';
}

/** Sequential lookups, spaced to stay under the API limit of 2 requests per second. */
export async function lookupIntraLogins(logins: string[]) {
	const results = new Map<string, IntraLookup>();
	for (const [index, login] of logins.entries()) {
		// With the API down there is no point in waiting for a timeout on every login.
		if ([...results.values()].includes('unavailable')) results.set(login, 'unavailable');
		else {
			if (index > 0 && !readEnv().AUTH_DEV_LOGIN) await new Promise((r) => setTimeout(r, 500));
			results.set(login, await lookupIntraLogin(login));
		}
	}
	return results;
}
