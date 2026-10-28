export const publicRoutes = [{ id: '/join/[code]', url: '/join/invalid', actions: ['default'] }];

export const adminRoutes = [
	{ id: '/admin/enroll', url: '/admin/enroll', actions: [] },
	{
		id: '/admin/archive',
		url: '/admin/archive',
		actions: ['preview', 'importCsv'],
		implementedActions: ['preview', 'importCsv']
	},
	{
		id: '/admin/archive/[pool].csv',
		implementedEndpoint: true,
		url: '/admin/archive/current.csv',
		endpoint: true,
		actions: []
	},
	{
		id: '/admin',
		url: '/admin',
		implementedActions: [
			'closePool',
			'reopenPool',
			'savePool',
			'cleanPool',
			'setPoolDates',
			'setActiveWeek',
			'setMaxEvents',
			'resetDisplayWeek',
			'createEvent',
			'duplicateEvent',
			'saveWeekAsTemplate',
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
			'closePool',
			'reopenPool',
			'savePool',
			'cleanPool',
			'setPoolDates',
			'setActiveWeek',
			'setMaxEvents',
			'createEvent',
			'duplicateEvent',
			'saveWeekAsTemplate',
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
		actions: ['add', 'remove', 'enrollment', 'review', 'approve', 'reject'],
		implementedActions: ['add', 'remove', 'enrollment', 'review', 'approve', 'reject']
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
	{
		id: '/admin/logs.csv',
		url: '/admin/logs.csv',
		endpoint: true,
		implementedEndpoint: true,
		actions: []
	}
];
