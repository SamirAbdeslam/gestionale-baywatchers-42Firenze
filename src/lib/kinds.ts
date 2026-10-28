export const EVENT_KINDS = ['exam', 'icebreaker', 'rush', 'cluster', 'welcome', 'custom'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const PRESETS = {
	exam: {
		title: 'Sorveglianza esami (2 ore)',
		description: 'Sorveglianza durante gli esami',
		compensation: 200
	},
	icebreaker: {
		title: 'Icebreaker',
		description: 'Evento sociale o icebreaker',
		compensation: 150
	},
	rush: {
		title: 'Correzioni rush',
		description: 'Correzione veloce di compiti o esami',
		compensation: 300
	},
	cluster: {
		title: 'Presenza cluster',
		description: 'Presenza al cluster per assistenza',
		compensation: 100
	},
	welcome: {
		title: 'Accoglienza primo giorno',
		description: 'Accoglienza studenti il primo giorno',
		compensation: 300
	}
} as const;

export function capitalizeFirst(text: string): string {
	const [first, ...rest] = text;
	return first ? first.toUpperCase() + rest.join('') : text;
}

export function inferKind(title: string): EventKind {
	const text = title.toLowerCase();
	if (/esam|sorveglianza/.test(text)) return 'exam';
	if (text.includes('icebreaker')) return 'icebreaker';
	if (/rush|correzion/.test(text)) return 'rush';
	if (/cluster|presenza/.test(text)) return 'cluster';
	if (text.includes('accoglienza')) return 'welcome';
	return 'custom';
}
