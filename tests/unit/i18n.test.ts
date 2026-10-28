import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const load = (locale: string) =>
	JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<string, string>;
const placeholders = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

it('keeps the same keys and placeholders in every language', () => {
	const base = load('it');
	for (const locale of ['en', 'fr']) {
		const messages = load(locale);
		expect(Object.keys(messages).sort()).toEqual(Object.keys(base).sort());
		for (const [key, text] of Object.entries(base))
			expect(placeholders(messages[key]), `${locale}.${key}`).toEqual(placeholders(text));
	}
});
