export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>
export type FileFormat = 'psd' | 'nef'
const maxPreviewBytes = 12 * 1024 * 1024

export function fileFormat(filename: string): FileFormat | undefined {
	if (/\.psd$/i.test(filename)) return 'psd'
	if (/\.(nef|nrw)$/i.test(filename)) return 'nef'
}

async function exact(read: ByteReader, offset: number, length: number) {
	if (
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		length < 0 ||
		length > maxPreviewBytes
	)
		throw new Error('Invalid or oversized preview section.')
	const bytes = await read(offset, length)
	if (bytes.length !== length) throw new Error('This file is truncated.')
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function jpegSize(bytes: Uint8Array) {
	const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
	if (bytes.length < 4 || data.getUint16(0) !== 0xffd8)
		throw new Error('The embedded preview is not a JPEG.')
	let at = 2
	while (at + 4 <= bytes.length) {
		if (bytes[at] !== 0xff) break
		const marker = bytes[at + 1] ?? 0
		if (marker === 0xff) {
			at++
			continue
		}
		if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) {
			at += 2
			continue
		}
		if (marker === 0xda || marker === 0xd9) break
		const length = data.getUint16(at + 2)
		if (length < 2 || at + 2 + length > bytes.length) break
		if (
			marker >= 0xc0 &&
			marker <= 0xcf &&
			![0xc4, 0xc8, 0xcc].includes(marker) &&
			length >= 8
		) {
			const height = data.getUint16(at + 5)
			const width = data.getUint16(at + 7)
			if (width && height && width * height <= 50_000_000)
				return { width, height }
			break
		}
		at += length + 2
	}
	throw new Error('The embedded JPEG has invalid dimensions.')
}

async function psdPreview(read: ByteReader) {
	const header = await exact(read, 0, 30)
	if (header.getUint32(0) !== 0x38425053 || header.getUint16(4) !== 1)
		throw new Error('This is not a supported PSD file.')
	const resourcesAt = 30 + header.getUint32(26)
	const resourcesSize = (await exact(read, resourcesAt, 4)).getUint32(0)
	const end = resourcesAt + 4 + resourcesSize
	let at = resourcesAt + 4
	for (let blocks = 0; at + 12 <= end && blocks < 4096; blocks++) {
		const block = await exact(read, at, 7)
		if (block.getUint32(0) !== 0x3842494d)
			throw new Error('Invalid PSD image resources.')
		const id = block.getUint16(4)
		const nameBytes = block.getUint8(6) + 1
		const sizeAt = at + 6 + nameBytes + (nameBytes % 2)
		if (sizeAt + 4 > end) throw new Error('Truncated PSD resource name.')
		const size = (await exact(read, sizeAt, 4)).getUint32(0)
		const dataAt = sizeAt + 4
		if (dataAt + size > end) throw new Error('Truncated PSD image resource.')
		// Adobe resource 1036 is an RGB JPEG thumbnail with a 28-byte header.
		if (id === 1036 && size > 28) {
			const thumbnail = await exact(read, dataAt, 28)
			const length = thumbnail.getUint32(20)
			if (thumbnail.getUint32(0) === 1 && length > 0 && length <= size - 28) {
				const jpeg = await read(dataAt + 28, length)
				if (jpeg.length !== length) throw new Error('Truncated PSD thumbnail.')
				return { jpeg, orientation: 1 }
			}
		}
		at = dataAt + size + (size % 2)
	}
	throw new Error(
		'This PSD has no saved JPEG thumbnail. Save it with a preview in Photoshop and try again.',
	)
}

async function nefPreview(read: ByteReader, highQuality: boolean) {
	const header = await exact(read, 0, 8)
	const order = header.getUint16(0)
	if (order !== 0x4949 && order !== 0x4d4d)
		throw new Error('This is not a TIFF-based Nikon RAW file.')
	const le = order === 0x4949
	if (header.getUint16(2, le) !== 42)
		throw new Error('Unsupported Nikon RAW header.')
	const queue = [header.getUint32(4, le)]
	const seen = new Set<number>()
	let orientation = 1
	let best: { offset: number; length: number } | undefined
	while (queue.length && seen.size < 32) {
		const at = queue.shift()
		if (!at || seen.has(at)) continue
		seen.add(at)
		const count = (await exact(read, at, 2)).getUint16(0, le)
		if (count > 512) throw new Error('Too many TIFF directory entries.')
		const data = await exact(read, at + 2, count * 12 + 4)
		const tags = new Map<number, number[]>()
		for (let i = 0; i < count; i++) {
			const p = i * 12
			const tag = data.getUint16(p, le)
			if (![0x0103, 0x0112, 0x014a, 0x0201, 0x0202].includes(tag)) continue
			const type = data.getUint16(p + 2, le)
			const n = data.getUint32(p + 4, le)
			if (![3, 4, 13].includes(type) || n < 1 || n > 64) continue
			const size = type === 3 ? 2 : 4
			const valueAt = n * size <= 4 ? at + 2 + p + 8 : data.getUint32(p + 8, le)
			const values = await exact(read, valueAt, n * size)
			tags.set(
				tag,
				Array.from({ length: n }, (_, j) =>
					size === 2
						? values.getUint16(j * size, le)
						: values.getUint32(j * size, le),
				),
			)
		}
		if (seen.size === 1) orientation = tags.get(0x0112)?.[0] ?? 1
		queue.push(...(tags.get(0x014a) ?? []), data.getUint32(count * 12, le))
		const offset = tags.get(0x0201)?.[0]
		const length = tags.get(0x0202)?.[0]
		const compression = tags.get(0x0103)?.[0]
		if (
			offset &&
			length &&
			length <= maxPreviewBytes &&
			(compression === undefined || compression === 6 || compression === 7) &&
			(!best || (highQuality ? length > best.length : length < best.length))
		)
			best = { offset, length }
	}
	if (!best)
		throw new Error(
			'This Nikon RAW file has no supported embedded JPEG preview.',
		)
	const jpeg = await read(best.offset, best.length)
	if (jpeg.length !== best.length) throw new Error('Truncated Nikon preview.')
	return {
		jpeg,
		orientation: orientation >= 1 && orientation <= 8 ? orientation : 1,
	}
}

export async function extractPreview(
	read: ByteReader,
	format: FileFormat,
	highQuality = true,
) {
	const preview = await (format === 'psd'
		? psdPreview(read)
		: nefPreview(read, highQuality))
	return { ...preview, ...jpegSize(preview.jpeg) }
}

export function orientJpeg(jpeg: Uint8Array, orientation: number) {
	if (orientation === 1) return jpeg
	// A first EXIF block supplies orientation even if the camera preview already contains EXIF.
	const exif = new Uint8Array([
		255,
		225,
		0,
		34,
		69,
		120,
		105,
		102,
		0,
		0,
		77,
		77,
		0,
		42,
		0,
		0,
		0,
		8,
		0,
		1,
		1,
		18,
		0,
		3,
		0,
		0,
		0,
		1,
		0,
		orientation,
		0,
		0,
		0,
		0,
		0,
		0,
	])
	const result = new Uint8Array(jpeg.length + exif.length)
	result.set(jpeg.subarray(0, 2))
	result.set(exif, 2)
	result.set(jpeg.subarray(2), 2 + exif.length)
	return result
}

export function previewPlan(
	highQuality: boolean,
	cached: { standard: boolean; high: boolean; standardFailed: boolean },
) {
	const display =
		highQuality && cached.high
			? 'high'
			: cached.standard
				? 'standard'
				: undefined
	const request = highQuality
		? cached.high
			? undefined
			: !cached.standard && !cached.standardFailed
				? 'standard'
				: 'high'
		: !cached.standard && !cached.standardFailed
			? 'standard'
			: undefined
	return { display, request } as const
}
