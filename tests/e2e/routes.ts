export const adminRoutes = [
	{
		id: '/admin',
		url: '/admin',
		implementedActions: [
			'setPoolDates',
			'setActiveWeek',
			'setMaxEvents',
			'resetDisplayWeek',
			'createEvent',
			'updateEvent',
			'deleteEvent',
			'deleteDayEvents',
			'deleteWeekEvents',
			'deleteAllEvents',
			'addParticipant',
			'removeParticipant',
			'setAttendance'
		],
		actions: [
			'setPoolDates',
			'setActiveWeek',
			'setMaxEvents',
			'createEvent',
			'updateEvent',
			'deleteEvent',
			'deleteDayEvents',
			'deleteWeekEvents',
			'deleteAllEvents',
			'addParticipant',
			'removeParticipant',
			'setAttendance',
			'resetDisplayWeek'
		]
	},
	{
		id: '/admin/whitelist',
		url: '/admin/whitelist',
		actions: ['add', 'remove'],
		implementedActions: ['add', 'remove']
	},
	{
		id: '/admin/templates',
		url: '/admin/templates',
		actions: ['apply', 'delete', 'importCsv'],
		implementedActions: ['apply', 'delete', 'importCsv']
	},
	{
		id: '/admin/templates/new',
		url: '/admin/templates/new',
		actions: ['save'],
		implementedActions: ['save']
	},
	{ id: '/admin/participants', url: '/admin/participants', actions: [] },
	{ id: '/admin/logs', url: '/admin/logs', actions: [] },
	{
		id: '/admin/templates/example.csv',
		implementedEndpoint: true,
		url: '/admin/templates/example.csv',
		endpoint: true,
		actions: []
	},
	{
		id: '/admin/participants/summary.csv',
		implementedEndpoint: true,
		url: '/admin/participants/summary.csv',
		endpoint: true,
		actions: []
	},
	{
		id: '/admin/participants/detailed.csv',
		implementedEndpoint: true,
		url: '/admin/participants/detailed.csv',
		endpoint: true,
		actions: []
	},
	{
		id: '/admin/participants/[login].csv',
		implementedEndpoint: true,
		url: '/admin/participants/dev_user.csv',
		endpoint: true,
		actions: []
	},
	{ id: '/admin/logs.csv', url: '/admin/logs.csv', endpoint: true, actions: [] }
];
