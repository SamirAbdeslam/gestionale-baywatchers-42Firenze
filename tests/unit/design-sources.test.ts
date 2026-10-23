import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps presentation styles in stylesheets rather than inline component styles', () => {
	const components = ['src/lib/components', 'src/routes'].flatMap((root) =>
		readdirSync(root, { recursive: true })
			.filter((file): file is string => typeof file === 'string' && file.endsWith('.svelte'))
			.map((file) => `${root}/${file}`)
	);
	expect(components.filter((file) => /\sstyle\s*[:=]/.test(readFileSync(file, 'utf8')))).toEqual(
		[]
	);
});
