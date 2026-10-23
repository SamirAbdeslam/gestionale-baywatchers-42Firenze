import { expect, it, vi } from 'vitest';
import { load } from '../../src/routes/+layout.server.ts';
vi.mock('#lib/server/env.ts', () => ({ readEnv: () => ({ AUTH_DEV_LOGIN: true }) }));
it('exposes only hasImage, never the CDN URL, in root layout data', async () => {
	const url = 'https://cdn.intra.42.fr/users/private-photo.jpg';
	const result = await load({
		locals: {
			user: {
				id: 1,
				login: 'student',
				displayName: 'Student',
				imageUrl: url,
				wallet: 1,
				role: 'user'
			}
		}
	} as Parameters<typeof load>[0]);
	expect(result).toMatchObject({ user: { login: 'student', hasImage: true } });
	expect(JSON.stringify(result)).not.toContain(url);
	expect(JSON.stringify(result)).not.toContain('imageUrl');
});
