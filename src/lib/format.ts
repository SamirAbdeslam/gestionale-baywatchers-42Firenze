import { getLocale } from '#lib/paraglide/runtime.js';

export const formatNumber = (value: number) => new Intl.NumberFormat(getLocale()).format(value);
