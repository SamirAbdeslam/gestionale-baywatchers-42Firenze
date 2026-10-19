import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = () => error(501, m.error_not_implemented());
