import { getLocale } from '#lib/paraglide/runtime.js';

export const formatNumber = (value: number) => new Intl.NumberFormat(getLocale()).format(value);

export const poolName = (date: string) =>
	new Intl.DateTimeFormat(getLocale(), {
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Rome'
	}).format(new Date(`${date}T12:00:00Z`));
