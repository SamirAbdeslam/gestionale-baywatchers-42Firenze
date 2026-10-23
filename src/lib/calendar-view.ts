type CounterEvent = {
	isRegistered: boolean;
	state: string;
	compensation: number;
	participants: { participantLogin: string; attended: boolean }[];
};
export function calendarTotals(events: CounterEvent[], login: string) {
	const mine = events.filter((event) => event.isRegistered);
	return {
		count: mine.length,
		compensation: mine.reduce(
			(total, event) =>
				total +
				(event.state === 'passed' &&
				!event.participants.some((p) => p.participantLogin === login && p.attended)
					? 0
					: event.compensation),
			0
		)
	};
}
