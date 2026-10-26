export const emptyTemplateEvent = () => ({
	title: '',
	description: '',
	weekday: '1',
	startTime: '09:00',
	endTime: '10:00',
	maxSlots: '2',
	compensation: '0'
});
export type TemplateForm = {
	name: string;
	description: string;
	targetWeek: string;
	events: ReturnType<typeof emptyTemplateEvent>[];
};
export const emptyTemplateForm = (): TemplateForm => ({
	name: '',
	description: '',
	targetWeek: '1',
	events: []
});

export function readTemplateForm(form: FormData): TemplateForm {
	const text = (name: string) => {
		const value = form.get(name);
		return typeof value === 'string' ? value : '';
	};
	const indices = [
		...new Set(
			[...form.keys()].flatMap((key) => {
				const match = /^events\.(\d+)\.[a-zA-Z]+$/.exec(key);
				return match ? [Number(match[1])] : [];
			})
		)
	].sort((a, b) => a - b);
	return {
		name: text('name'),
		description: text('description'),
		targetWeek: text('targetWeek'),
		events: indices.map(
			(index) =>
				Object.fromEntries(
					Object.keys(emptyTemplateEvent()).map((key) => [key, text(`events.${index}.${key}`)])
				) as ReturnType<typeof emptyTemplateEvent>
		)
	};
}
