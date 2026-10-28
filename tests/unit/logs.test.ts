import { expect, it } from 'vitest';
import { logCategory } from '../../src/lib/server/domain/logs.ts';
it.each([
	['CREATE_EVENT', 'create'],
	['ADMIN_ADD_PARTICIPANT', 'create'],
	['APPLY_TEMPLATE', 'create'],
	['IMPORT_TEMPLATES', 'create'],
	['UPDATE_EVENT', 'update'],
	['MARK_ABSENT', 'update'],
	['ACTIVATE_WEEK', 'update'],
	['UPDATE_SETTING', 'update'],
	['DELETE_EVENT', 'delete'],
	['WHITELIST_REMOVE', 'delete'],
	['ADMIN_UNREGISTER', 'delete'],
	['UNREGISTER_EVENT', 'delete'],
	['REGISTER_EVENT', 'register'],
	['SETTING', 'update'],
	['LOGIN', 'other']
])('keeps legacy category precedence for %s', (action, category) =>
	expect(logCategory(action)).toBe(category)
);
