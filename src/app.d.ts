import type { User } from '#lib/server/auth/session.ts';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
		}
		interface Error {
			message: string;
			id?: string;
		}
	}
}
export {};
