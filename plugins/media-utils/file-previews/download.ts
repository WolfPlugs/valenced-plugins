import type { ByteReader } from './formats'

const maxBytes = 24 * 1024 * 1024

export function rangeReader(url: string, signal: AbortSignal): ByteReader {
	const chunks: { offset: number; bytes: Uint8Array }[] = []
	let downloaded = 0
	return async (offset, length) => {
		if (
			!Number.isSafeInteger(offset) ||
			offset < 0 ||
			!Number.isSafeInteger(length) ||
			length < 0 ||
			length > 12 * 1024 * 1024
		)
			throw new Error('Invalid preview byte range.')
		if (!length) return new Uint8Array()
		for (const chunk of chunks) {
			if (
				offset >= chunk.offset &&
				offset + length <= chunk.offset + chunk.bytes.length
			)
				return chunk.bytes.subarray(
					offset - chunk.offset,
					offset - chunk.offset + length,
				)
		}
		if (chunks.length >= 512) throw new Error('Too many preview requests.')
		const amount = Math.max(length, 64 * 1024)
		const response = await fetch(url, {
			headers: { Range: `bytes=${offset}-${offset + amount - 1}` },
			signal,
		})
		if (!response.ok)
			throw new Error(`Could not download preview: HTTP ${response.status}.`)
		const declared = Number(response.headers.get('content-length'))
		if (declared > maxBytes - downloaded)
			throw new Error('The preview download exceeds 24 MB.')
		const start =
			response.status === 200
				? 0
				: Number(
						/^bytes (\d+)-/.exec(
							response.headers.get('content-range') ?? '',
						)?.[1],
					)
		if (
			!Number.isSafeInteger(start) ||
			(response.status !== 200 && start !== offset)
		)
			throw new Error('The server returned an invalid byte range.')
		const bytes = new Uint8Array(await response.arrayBuffer())
		downloaded += bytes.length
		if (downloaded > maxBytes)
			throw new Error('The preview download exceeds 24 MB.')
		chunks.push({ offset: start, bytes })
		return bytes.subarray(offset - start, offset - start + length)
	}
}

export function base64(bytes: Uint8Array) {
	const alphabet =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	const chunks: string[] = []
	let chunk = ''
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i] ?? 0
		const b = bytes[i + 1] ?? 0
		const c = bytes[i + 2] ?? 0
		chunk +=
			alphabet[a >> 2] +
			alphabet[((a & 3) << 4) | (b >> 4)] +
			(i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=') +
			(i + 2 < bytes.length ? alphabet[c & 63] : '=')
		if (chunk.length >= 16384) {
			chunks.push(chunk)
			chunk = ''
		}
	}
	chunks.push(chunk)
	return chunks.join('')
}
