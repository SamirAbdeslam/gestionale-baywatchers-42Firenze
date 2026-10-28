import { z } from 'zod';
import { actionLogs } from '../db/schema.ts';
import type { Transaction } from '../db/index.ts';
import type { User } from '../auth/session.ts';

export const ACTION_TYPES = [
	'CREATE_EVENT',
	'UPDATE_EVENT',
	'DELETE_EVENT',
	'DELETE_DAY_EVENTS',
	'DELETE_WEEK_EVENTS',
	'DELETE_ALL_EVENTS',
	'REGISTER_EVENT',
	'UNREGISTER_EVENT',
	'ADMIN_UNREGISTER',
	'ADMIN_ADD_PARTICIPANT',
	'MARK_PRESENT',
	'MARK_ABSENT',
	'ACTIVATE_WEEK',
	'UPDATE_SETTING',
	'CREATE_TEMPLATE',
	'APPLY_TEMPLATE',
	'DELETE_TEMPLATE',
	'IMPORT_TEMPLATES',
	'WHITELIST_ADD',
	'WHITELIST_REMOVE',
	'WHITELIST_REQUEST',
	'WHITELIST_REJECT',
	'CLOSE_POOL',
	'REOPEN_POOL',
	'SAVE_POOL',
	'CLEAN_POOL',
	'IMPORT_POOL',
	'LOGIN'
] as const;
export type RequestInfo = { ipAddress: string; userAgent: string | null };
export async function audit(
	tx: Transaction,
	input: RequestInfo & {
		actor: Pick<User, 'id' | 'login'> | typeof SYSTEM_ACTOR;
		actionType: (typeof ACTION_TYPES)[number];
		description: string;
		resourceType?: string;
		resourceId?: string;
		oldValue?: unknown;
		newValue?: unknown;
	}
) {
	const [row] = await tx
		.insert(actionLogs)
		.values({
			actorUserId: input.actor.id,
			actorLogin: input.actor.login,
			actionType: z.enum(ACTION_TYPES).parse(input.actionType),
			description: input.description,
			ipAddress: input.ipAddress,
			userAgent: input.userAgent?.slice(0, 200) ?? null,
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			oldValue: input.oldValue,
			newValue: input.newValue
		})
		.returning({ id: actionLogs.id });
	return row.id;
}

// This actor is constructed only by server code, never from request fields.
export const SYSTEM_ACTOR = Object.freeze({ id: null, login: 'SYSTEM' } as const);
