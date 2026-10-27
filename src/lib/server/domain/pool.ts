import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '../db/index.ts';
import { events, settings, whitelist } from '../db/schema.ts';
import { assertAdmin, lockAdmin } from '../auth/guards.ts';
import type { User } from '../auth/session.ts';
import { audit, type RequestInfo } from './audit.ts';
import { deletionSnapshot } from './events.ts';
import { publish } from '../realtime/bus.ts';

const checkbox = z.literal('yes').optional();
const closureSchema = z.strictObject({
	downloaded: checkbox,
	events: checkbox,
	whitelist: checkbox,
	weeks: checkbox,
	dates: checkbox
});
export type PoolNotice = {
	type: 'success' | 'warning';
	key: 'pool_closed' | 'pool_download_required' | 'pool_nothing_selected';
	params: Record<string, never>;
};

export function preparePoolClosure(actor: User | null, input: unknown) {
	assertAdmin(actor);
	const choices = closureSchema.parse(input);
	const key = !choices.downloaded
		? 'pool_download_required'
		: !choices.events && !choices.whitelist && !choices.weeks && !choices.dates
			? 'pool_nothing_selected'
			: null;
	const messages: PoolNotice[] = key ? [{ type: 'warning', key, params: {} }] : [];
	return { choices: key ? null : choices, messages };
}

export async function closePool(
	database: typeof db,
	actor: User | null,
	input: unknown,
	info: RequestInfo,
	now: Date
) {
	assertAdmin(actor);
	const { choices, messages } = preparePoolClosure(actor, input);
	if (!choices) return { ok: false, messages };
	const { logId, weeksChanged } = await database.transaction(async (tx) => {
		const user = await lockAdmin(tx, actor);
		const [before] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
		if (!before) throw new Error('Settings row is missing');
		const removedEvents = choices.events ? await deletionSnapshot(tx, undefined) : undefined;
		const removedWhitelist = choices.whitelist
			? await tx.select().from(whitelist).orderBy(whitelist.id).for('update')
			: undefined;
		const oldSettings = {
			...(choices.weeks ? { activeWeek: before.activeWeek, displayWeek: before.displayWeek } : {}),
			...(choices.dates ? { poolStart: before.poolStart, poolEnd: before.poolEnd } : {})
		};
		if (removedEvents?.length)
			await tx.delete(events).where(
				inArray(
					events.id,
					removedEvents.map((row) => row.id)
				)
			);
		if (removedWhitelist?.length)
			await tx.delete(whitelist).where(
				inArray(
					whitelist.id,
					removedWhitelist.map((row) => row.id)
				)
			);
		if (choices.weeks || choices.dates)
			await tx
				.update(settings)
				.set({
					...(choices.weeks ? { activeWeek: 1, displayWeek: 1 } : {}),
					...(choices.dates ? { poolStart: null, poolEnd: null } : {}),
					updatedAt: now
				})
				.where(eq(settings.id, 1));
		const logId = await audit(tx, {
			...info,
			actor: user,
			actionType: 'CLOSE_POOL',
			description: 'Chiusura della piscina.',
			resourceType: 'pool',
			oldValue: {
				...(removedEvents ? { events: removedEvents } : {}),
				...(removedWhitelist ? { whitelist: removedWhitelist } : {}),
				...(choices.weeks || choices.dates ? { settings: oldSettings } : {})
			}
		});
		return {
			logId,
			weeksChanged: !!choices.weeks && (before.activeWeek !== 1 || before.displayWeek !== 1)
		};
	});
	publish({ type: 'log_created', id: logId });
	publish({ type: 'event_changed', eventId: null, week: null, action: 'bulk_delete' });
	if (weeksChanged) publish({ type: 'week_activated', week: 1 });
	return {
		ok: true,
		messages: [{ type: 'success', key: 'pool_closed', params: {} }] satisfies PoolNotice[]
	};
}
