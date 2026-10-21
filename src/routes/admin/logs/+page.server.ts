import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ depends }) => {
	depends('app:logs');
	return {};
};
