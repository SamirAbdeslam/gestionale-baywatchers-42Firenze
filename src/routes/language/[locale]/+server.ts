import { error, redirect } from '@sveltejs/kit';
import { cookieMaxAge, cookieName, isLocale } from '#lib/paraglide/runtime.js';
import { m } from '#lib/paraglide/messages.js';
import type { RequestHandler } from './$types';

// A plain link sets the language, so the switcher also works without JavaScript.
export const GET: RequestHandler = ({ params, url, cookies }) => {
	if (!isLocale(params.locale)) error(404, m.error_not_found());
	// Paraglide reads the cookie in the browser too, so it cannot be httpOnly.
	cookies.set(cookieName, params.locale, {
		path: '/',
		maxAge: cookieMaxAge,
		httpOnly: false,
		sameSite: 'lax'
	});
	const to = url.searchParams.get('to') ?? '/';
	// Only same-site paths: '//host' and '/\host' would leave the site.
	redirect(303, /^\/(?![/\\])/.test(to) ? to : '/');
};
