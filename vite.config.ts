import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { loadEnv } from 'vite';
import { originSchema } from './src/lib/server/env.ts';

export default defineConfig(({ mode }) => {
	const origin = originSchema.parse(loadEnv(mode, process.cwd(), '').ORIGIN);
	return {
		plugins: [
			sveltekit({
				paths: { origin },
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter(),
				csp: {
					mode: 'auto',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self'],
						'img-src': ['self', 'https://cdn.intra.42.fr', 'data:'],
						'connect-src': ['self'],
						'frame-ancestors': ['none'],
						'base-uri': ['self'],
						'form-action': ['self', 'https://api.intra.42.fr']
					}
				}
			}),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true,
				strategy: ['cookie', 'preferredLanguage', 'baseLocale']
			})
		],
		test: {
			expect: { requireAssertions: true },
			projects: [
				{ test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
				{
					test: {
						name: 'integration',
						fileParallelism: false,
						environment: 'node',
						include: ['tests/integration/**/*.test.ts'],
						env: {
							DATABASE_URL:
								process.env.DATABASE_URL ?? 'postgres://bay:bay@localhost:5432/baywatchers_test'
						}
					}
				}
			]
		}
	};
});
