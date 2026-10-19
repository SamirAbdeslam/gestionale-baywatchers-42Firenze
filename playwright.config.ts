import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
if (new URL(databaseUrl).pathname !== '/baywatchers_test') {
	throw new Error('E2E tests require the baywatchers_test database');
}

export default defineConfig({
	testDir: './tests/e2e',
	// Tests share singleton settings, so browser projects must not mutate them concurrently.
	workers: 1,
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		},
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node build',
		url: 'http://localhost:4173/healthz',
		reuseExistingServer: false,
		env: {
			NODE_ENV: 'production',
			PORT: '4173',
			ORIGIN: 'http://localhost:4173',
			AUTH_DEV_LOGIN: 'true',
			TZ: 'Europe/Rome',
			DATABASE_URL: databaseUrl
		}
	}
});
