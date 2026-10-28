import { z } from 'zod';

const httpUrl = z.url({ protocol: /^https?$/ });
export const originSchema = httpUrl.refine(
	(value) => URL.parse(value)?.origin === value,
	'Must be an origin without path, credentials, query or fragment'
);

export const envSchema = z
	.object({
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
		ORIGIN: originSchema,
		FT_CLIENT_ID: z.string().default(''),
		FT_CLIENT_SECRET: z.string().default(''),
		AUTH_DEV_LOGIN: z
			.enum(['true', 'false'])
			.default('false')
			.transform((v) => v === 'true'),
		DISPLAY_TOKEN: z.union([z.literal(''), z.string().min(24)]).default(''),
		DISPLAY_REDIRECT_URL: z.union([z.literal(''), httpUrl]).default(''),
		DISPLAY_REDIRECT_SECONDS: z.coerce.number().int().positive().default(30),
		TZ: z.literal('Europe/Rome'),
		ADDRESS_HEADER: z.string().optional(),
		XFF_DEPTH: z.coerce.number().int().positive().optional(),
		BODY_SIZE_LIMIT: z
			.string()
			.regex(/^\d+[KMG]?$/i)
			.default('2M'),
		POSTGRES_USER: z.string().optional(),
		POSTGRES_PASSWORD: z.string().optional(),
		POSTGRES_DB: z.string().optional()
	})
	.superRefine((env, ctx) => {
		if (
			env.AUTH_DEV_LOGIN &&
			!['localhost', '127.0.0.1'].includes(URL.parse(env.ORIGIN)?.hostname ?? '')
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['AUTH_DEV_LOGIN'],
				message: 'Requires a localhost ORIGIN'
			});
		}
		if (
			!['localhost', '127.0.0.1'].includes(URL.parse(env.ORIGIN)?.hostname ?? '') &&
			env.DISPLAY_TOKEN.trim().length < 32
		) {
			ctx.addIssue({
				code: 'custom',
				path: ['DISPLAY_TOKEN'],
				message: 'Requires at least 32 characters outside localhost'
			});
		}
		if (env.NODE_ENV === 'production' && !env.AUTH_DEV_LOGIN) {
			for (const key of ['FT_CLIENT_ID', 'FT_CLIENT_SECRET'] as const) {
				if (!env[key])
					ctx.addIssue({ code: 'custom', path: [key], message: 'Required in production' });
			}
		}
	});

export function readEnv(input = process.env) {
	const result = envSchema.safeParse(input);
	if (!result.success) {
		throw new Error(
			`Invalid environment: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`
		);
	}
	return result.data;
}
