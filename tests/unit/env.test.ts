import { describe, expect, it } from 'vitest';
import { readEnv } from '../../src/lib/server/env';

const base = {
	DATABASE_URL: 'postgres://bay:bay@localhost:5432/baywatchers_test',
	ORIGIN: 'http://localhost',
	TZ: 'Europe/Rome'
};

describe('environment validation', () => {
	it('accepts local development and supplies optional defaults', () => {
		expect(readEnv(base)).toMatchObject({
			AUTH_DEV_LOGIN: false,
			DISPLAY_REDIRECT_SECONDS: 30,
			DISPLAY_TOKEN: ''
		});
	});
	it.each(['DATABASE_URL', 'ORIGIN', 'TZ'] as const)('rejects missing %s', (key) => {
		const input: NodeJS.ProcessEnv = { ...base };
		delete input[key];
		expect(() => readEnv(input)).toThrow(key);
	});
	it.each(['https://example.com', 'http://localhost.example.com'])(
		'rejects dev login on %s',
		(ORIGIN) => {
			expect(() => readEnv({ ...base, ORIGIN, AUTH_DEV_LOGIN: 'true' })).toThrow('AUTH_DEV_LOGIN');
		}
	);
	it.each(['http://localhost', 'http://127.0.0.1:4173'])(
		'allows local dev login on %s',
		(ORIGIN) => {
			expect(
				readEnv({ ...base, ORIGIN, AUTH_DEV_LOGIN: 'true', NODE_ENV: 'production' }).AUTH_DEV_LOGIN
			).toBe(true);
		}
	);
	it('requires OAuth credentials for production without dev login', () => {
		expect(() => readEnv({ ...base, NODE_ENV: 'production' })).toThrow('FT_CLIENT_SECRET');
	});
	it('accepts production OAuth configuration', () => {
		expect(
			readEnv({
				...base,
				NODE_ENV: 'production',
				FT_CLIENT_ID: 'test-id',
				FT_CLIENT_SECRET: 'test-secret'
			}).AUTH_DEV_LOGIN
		).toBe(false);
	});
	it.each([
		{ AUTH_DEV_LOGIN: 'yes' },
		{ ORIGIN: 'invalid', AUTH_DEV_LOGIN: 'true' },
		{ DISPLAY_TOKEN: 'short' },
		{ DISPLAY_REDIRECT_URL: 'javascript:alert(1)' },
		{ DISPLAY_REDIRECT_SECONDS: '0' },
		{ TZ: 'UTC' },
		{ DATABASE_URL: 'https://example.com' }
	])('rejects invalid configuration %j', (input) => {
		expect(() => readEnv({ ...base, ...input })).toThrow('Invalid environment');
	});
});
