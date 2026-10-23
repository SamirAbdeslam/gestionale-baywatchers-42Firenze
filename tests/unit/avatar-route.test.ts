import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../../src/routes/avatar/[login]/+server.ts';
const mocks = vi.hoisted(() => ({ where: vi.fn(), download: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({
	db: { select: () => ({ from: () => ({ where: mocks.where }) }) }
}));
vi.mock('#lib/server/avatar.ts', () => ({ avatarResponse: mocks.download }));
beforeEach(() => {
	vi.clearAllMocks();
});
function event(login: string, authenticated = true) {
	return {
		locals: { user: authenticated ? { role: 'user', login: 'self' } : null },
		params: { login }
	} as unknown as Parameters<typeof GET>[0];
}
it('rejects anonymous access before looking up an image', async () => {
	await expect(GET(event('student', false))).rejects.toMatchObject({ status: 401 });
	expect(mocks.where).not.toHaveBeenCalled();
	expect(mocks.download).not.toHaveBeenCalled();
});
it.each(['UPPER', 'https://example.test', '../private', 'name.with.dot'])(
	'validates login %s before any lookup or download',
	async (login) => {
		expect((await GET(event(login))).status).toBe(404);
		expect(mocks.where).not.toHaveBeenCalled();
		expect(mocks.download).not.toHaveBeenCalled();
	}
);
it('downloads only the URL obtained from the database', async () => {
	mocks.where.mockResolvedValueOnce([{ imageUrl: 'https://cdn.intra.42.fr/private-photo.jpg' }]);
	mocks.download.mockResolvedValueOnce(new Response('image'));
	expect((await GET(event('student'))).status).toBe(200);
	expect(mocks.download).toHaveBeenCalledExactlyOnceWith(
		'https://cdn.intra.42.fr/private-photo.jpg'
	);
});
it('returns a generic 404 when the database lookup fails', async () => {
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.where.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_DETAILS'));
	try {
		expect((await GET(event('student'))).status).toBe(404);
		expect(log).toHaveBeenCalledExactlyOnceWith('Avatar lookup failed');
		expect(mocks.download).not.toHaveBeenCalled();
	} finally {
		log.mockRestore();
	}
});
