import UPNG from '@pdf-lib/upng'
import type { ByteReader } from './formats'

// Decode the saved merged image, rather than rebuilding Photoshop's layer effects.
// PSD layout and PackBits rows: https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/
export async function psdComposite(read: ByteReader) {
	async function section(offset: number, length: number) {
		const bytes = await read(offset, length)
		if (bytes.length !== length) throw new Error('Truncated PSD merged image.')
		return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	}
	const header = await section(0, 26)
	if (header.getUint32(0) !== 0x38425053 || header.getUint16(4) !== 1)
		throw new Error('Unsupported PSD header.')
	const channels = header.getUint16(12)
	const height = header.getUint32(14)
	const width = header.getUint32(18)
	const mode = header.getUint16(24)
	if (header.getUint16(22) !== 8 || (mode !== 1 && mode !== 3))
		throw new Error(
			'High-quality previews support 8-bit RGB and grayscale PSD files.',
		)
	const colors = mode === 3 ? 3 : 1
	if (
		channels < colors ||
		channels > 56 ||
		!width ||
		!height ||
		width > 30000 ||
		height > 30000 ||
		width * height > 8_000_000
	)
		throw new Error(
			'This PSD exceeds the 8-megapixel high-quality preview limit.',
		)
	let at = 26
	let mergedAlpha = false
	for (let i = 0; i < 3; i++) {
		const length = (await section(at, 4)).getUint32(0)
		if (i === 2 && length >= 6) {
			const layerInfo = await section(at + 4, 6)
			mergedAlpha = layerInfo.getUint32(0) >= 2 && layerInfo.getInt16(4) < 0
		}
		at += 4 + length
	}
	const compression = (await section(at, 2)).getUint16(0)
	at += 2
	if (compression !== 0 && compression !== 1)
		throw new Error('This PSD merged image uses unsupported ZIP compression.')
	const usedChannels = colors + (mergedAlpha && channels > colors ? 1 : 0)
	const pixels = new Uint8Array(width * height * 4)
	for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
	let rows: DataView | undefined
	if (compression === 1) {
		rows = await section(at, channels * height * 2)
		at += channels * height * 2
	}
	for (let channel = 0; channel < usedChannels; channel++) {
		for (let y = 0; y < height; y++) {
			const count = rows ? rows.getUint16((channel * height + y) * 2) : width
			const encoded = await read(at, count)
			at += count
			if (encoded.length !== count) throw new Error('Truncated PSD pixel row.')
			const row = compression === 1 ? unpackRow(encoded, width) : encoded
			for (let x = 0; x < width; x++) {
				const value = row[x] ?? 0
				const pixel = (y * width + x) * 4
				if (mode === 1 && channel === 0) {
					pixels[pixel] = value
					pixels[pixel + 1] = value
					pixels[pixel + 2] = value
				} else pixels[pixel + (channel === colors ? 3 : channel)] = value
			}
		}
		// Let the UI handle gestures and cancellation between color planes.
		await new Promise<void>(resolve => setTimeout(resolve, 0))
	}
	const bytes = new Uint8Array(UPNG.encode([pixels.buffer], width, height, 0))
	if (bytes.length > 12 * 1024 * 1024)
		throw new Error('The decoded PSD preview exceeds 12 MB.')
	return {
		bytes,
		width,
		height,
		orientation: 1,
		mimeType: 'image/png' as const,
		extension: 'png' as const,
	}
}

export function unpackRow(encoded: Uint8Array, width: number) {
	const result = new Uint8Array(width)
	let source = 0
	let target = 0
	while (source < encoded.length) {
		const control = encoded[source++] ?? 128
		if (control === 128) continue
		const count = control < 128 ? control + 1 : 257 - control
		if (target + count > width) throw new Error('Invalid PSD RLE row length.')
		if (control < 128) {
			if (source + count > encoded.length)
				throw new Error('Truncated PSD RLE literal.')
			result.set(encoded.subarray(source, source + count), target)
			source += count
		} else {
			if (source >= encoded.length) throw new Error('Truncated PSD RLE repeat.')
			result.fill(encoded[source++] ?? 0, target, target + count)
		}
		target += count
	}
	if (target !== width) throw new Error('Incomplete PSD RLE row.')
	return result
}
