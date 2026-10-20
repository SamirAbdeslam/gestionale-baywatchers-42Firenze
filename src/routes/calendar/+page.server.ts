import { formAction } from '#lib/server/form-action.ts';
import { register, unregister } from '#lib/server/domain/registrations.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	register: (event) => formAction(event, register),
	unregister: (event) => formAction(event, unregister)
};
