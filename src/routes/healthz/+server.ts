import { json } from '@sveltejs/kit';

export async function GET() {
	try {
		const { client } = await import('#lib/server/db/index.ts');
		await client`SELECT 1`;
		return json({ status: 'ok' });
	} catch {
		return json({ status: 'error' }, { status: 503 });
	}
}
