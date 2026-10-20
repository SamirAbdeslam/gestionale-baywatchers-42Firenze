import { registrationAction } from '#lib/server/registration-actions.ts';
import { register, unregister } from '#lib/server/domain/registrations.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	register: (event) => registrationAction(event, register),
	unregister: (event) => registrationAction(event, unregister)
};
