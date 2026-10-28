export function parseTheme(value: string | undefined): 'light' | 'dark' | undefined {
	return value === 'light' || value === 'dark' ? value : undefined;
}
