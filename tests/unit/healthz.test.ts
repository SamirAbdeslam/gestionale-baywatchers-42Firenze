import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../../src/routes/healthz/+server';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ client: query }));
beforeEach(() => query.mockReset());

it('returns 200 when the database responds', async () => {
	query.mockResolvedValueOnce([]);
	const response = await GET();
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: 'ok' });
});

it('returns 503 without database error details', async () => {
	query.mockRejectedValueOnce(new Error('private database connection details'));
	const response = await GET();
	expect(response.status).toBe(503);
	expect(await response.json()).toEqual({ status: 'error' });
});
