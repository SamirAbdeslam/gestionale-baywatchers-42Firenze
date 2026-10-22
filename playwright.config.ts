import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
	process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test';
if (new URL(databaseUrl).pathname !== '/baywatchers_test') {
	throw new Error('E2E tests require the baywatchers_test database');
}

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
	projects: [
		// Shared-table mutations and snapshots finish before independent parallel tests.
		{
			name: 'chromium-shared',
			grep: /@shared-db/,
			fullyParallel: false,
			workers: 1,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'mobile-shared',
			grep: /@shared-db/,
			fullyParallel: false,
			workers: 1,
			dependencies: ['chromium-shared'],
			use: { ...devices['Pixel 7'] }
		},
		{
			name: 'webkit-shared',
			testMatch: ['events.test.ts', 'calendar.test.ts', 'navigation.test.ts', 'logs.test.ts'],
			fullyParallel: false,
			workers: 1,
			dependencies: ['mobile-shared'],
			use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'chromium',
			grepInvert: /@shared-db/,
			dependencies: ['webkit-shared'],
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'mobile',
			grepInvert: /@shared-db/,
			dependencies: ['webkit-shared'],
			use: { ...devices['Pixel 7'] }
		}
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
			DISPLAY_TOKEN: '',
			DISPLAY_REDIRECT_URL: 'http://localhost:4173/healthz',
			DISPLAY_REDIRECT_SECONDS: '8',
			TZ: 'Europe/Rome',
			DATABASE_URL: databaseUrl
		}
	}
});
