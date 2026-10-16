import assert from 'node:assert/strict';
import { afterAll, expect, it } from 'vitest';
import postgres from 'postgres';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/baywatchers_test');
const client = postgres(process.env.DATABASE_URL!, { connect_timeout: 5 });
afterAll(() => client.end());

it('connects to the isolated test database', async () => {
	const [row] = await client`SELECT current_database() AS name, 1 AS value`;
	expect(row).toEqual({ name: 'baywatchers_test', value: 1 });
});
