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
	// Parse like the browser does and redirect to the absolute URL: a bare path such as
	// '//host' (also reachable via '/.//host' or tabs) would leave the site.
	const target = new URL(url.searchParams.get('to') ?? '/', url);
	redirect(303, target.origin === url.origin ? target.href : '/');
};
