import { getAppToken, invalidateAppToken } from './auth/app-token.ts';

const maxBytes = 2 * 1024 * 1024;

async function readImage(response: Response): Promise<Uint8Array<ArrayBuffer>> {
	const length = response.headers.get('content-length');
	if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
		await response.body?.cancel();
		throw new Error('Avatar exceeds the byte limit');
	}
	if (!response.body) throw new Error('Empty avatar response');
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maxBytes) {
				await reader.cancel();
				throw new Error('Avatar exceeds the byte limit');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function avatarResponse(imageUrl: string | null | undefined): Promise<Response> {
	if (!imageUrl) return new Response(null, { status: 404 });
	try {
		const url = new URL(imageUrl);
		if (url.protocol !== 'https:' || url.host !== 'cdn.intra.42.fr' || url.username || url.password)
			return new Response(null, { status: 404 });
		for (let attempt = 0; attempt < 2; attempt++) {
			const token = await getAppToken();
			if (!token) return new Response(null, { status: 404 });
			const response = await fetch(url, {
				headers: { Authorization: `Bearer ${token}` },
				redirect: 'error',
				signal: AbortSignal.timeout(10000)
			});
			if (response.status === 401 && attempt === 0) {
				await response.body?.cancel();
				invalidateAppToken(token);
				continue;
			}
			const contentType = response.headers.get('content-type') ?? '';
			if (response.status !== 200 || !contentType.toLowerCase().startsWith('image/')) {
				await response.body?.cancel();
				throw new Error('Invalid avatar response');
			}
			return new Response(await readImage(response), {
				headers: {
					'Content-Type': contentType,
					'Cache-Control': 'private, max-age=86400',
					'X-Content-Type-Options': 'nosniff',
					'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox"
				}
			});
		}
	} catch {
		// Provider exceptions can contain credential-bearing request details.
		console.error('Avatar request failed');
	}
	return new Response(null, { status: 404 });
}
