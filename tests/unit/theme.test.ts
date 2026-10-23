import { expect, it } from 'vitest';
import { parseTheme } from '../../src/lib/theme.ts';

it.each(['light', 'dark'] as const)('accepts the explicit %s theme', (value) => {
	expect(parseTheme(value)).toBe(value);
});
it.each([undefined, '', 'system', 'LIGHT', 'dark" onclick="alert(1)'])(
	'ignores an absent or invalid theme: %s',
	(value) => {
		expect(parseTheme(value)).toBeUndefined();
	}
);
