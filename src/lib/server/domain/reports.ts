export type AttendanceRow = {
	participantLogin: string;
	attended: boolean;
	startTime: string;
	endTime: string;
	compensation: number;
};

export function participantTotals(rows: AttendanceRow[]) {
	const totals = new Map<
		string,
		{ login: string; events: number; minutes: number; altarian: number }
	>();
	for (const row of rows) {
		const total = totals.get(row.participantLogin) ?? {
			login: row.participantLogin,
			events: 0,
			minutes: 0,
			altarian: 0
		};
		if (row.attended) {
			const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
			total.events++;
			total.minutes += minutes(row.endTime) - minutes(row.startTime);
			total.altarian += row.compensation;
		}
		totals.set(row.participantLogin, total);
	}
	return [...totals.values()]
		.sort((a, b) => a.login.localeCompare(b.login))
		.map(({ minutes, ...total }) => ({ ...total, hours: Number((minutes / 60).toFixed(2)) }));
}
