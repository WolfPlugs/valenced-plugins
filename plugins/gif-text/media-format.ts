export type MediaFormat = {
	extension: string
	mimeType: string
	width?: number
	height?: number
}

export function detectMedia(bytes: Uint8Array): MediaFormat | undefined {
	const text = (start: number, length: number) =>
		String.fromCharCode(...bytes.subarray(start, start + length))
	if (bytes.length >= 13 && ['GIF89a', 'GIF87a'].includes(text(0, 6)))
		return {
			extension: 'gif',
			mimeType: 'image/gif',
			width: bytes[6] | (bytes[7] << 8),
			height: bytes[8] | (bytes[9] << 8),
		}
	if (bytes.length >= 24 && text(0, 8) === '\x89PNG\r\n\x1a\n') {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		// APNG uses the same signature. Keep the original animation chunks intact.
		return {
			extension: 'png',
			mimeType: 'image/png',
			width: view.getUint32(16),
			height: view.getUint32(20),
		}
	}
	if (
		bytes.length >= 3 &&
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff
	)
		return { extension: 'jpg', mimeType: 'image/jpeg' }
	if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP')
		return { extension: 'webp', mimeType: 'image/webp' }
	if (bytes.length >= 12 && text(4, 4) === 'ftyp') {
		if (['avif', 'avis'].includes(text(8, 4)))
			return { extension: 'avif', mimeType: 'image/avif' }
		if (/^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(text(8, 4)))
			return { extension: 'mp4', mimeType: 'video/mp4' }
		if (text(8, 4) === 'qt  ')
			return { extension: 'mov', mimeType: 'video/quicktime' }
	}
	if (
		bytes.length >= 4 &&
		bytes[0] === 0x1a &&
		bytes[1] === 0x45 &&
		bytes[2] === 0xdf &&
		bytes[3] === 0xa3 &&
		text(0, Math.min(256, bytes.length)).includes('webm')
	)
		return { extension: 'webm', mimeType: 'video/webm' }
	return undefined
}
