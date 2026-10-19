import { fail } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { Actions } from './$types';

// Placeholder actions exercise authorization before their owning module implements them.
const pending = () => fail(501, { message: m.error_not_implemented() });
export const actions: Actions = { register: pending, unregister: pending };
