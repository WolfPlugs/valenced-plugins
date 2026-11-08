type Element = {
	id: number
	start: number
	data: number
	end: number
	sizeBytes: number
	size: number
}
function element(bytes: Uint8Array, start: number): Element {
	let idBytes = 1
	while (idBytes <= 4 && !(bytes[start] & (1 << (8 - idBytes)))) idBytes++
	if (idBytes > 4) throw new Error('Invalid WebM element.')
	let id = 0
	for (let i = 0; i < idBytes; i++) id = id * 256 + bytes[start + i]
	const sizeStart = start + idBytes
	let sizeBytes = 1
	while (sizeBytes <= 8 && !(bytes[sizeStart] & (1 << (8 - sizeBytes))))
		sizeBytes++
	if (sizeBytes > 8 || sizeStart + sizeBytes > bytes.length)
		throw new Error('Invalid WebM size.')
	let size = bytes[sizeStart] & ((1 << (8 - sizeBytes)) - 1)
	let unknown = size === (1 << (8 - sizeBytes)) - 1
	for (let i = 1; i < sizeBytes; i++) {
		size = size * 256 + bytes[sizeStart + i]
		unknown &&= bytes[sizeStart + i] === 255
	}
	const data = sizeStart + sizeBytes
	if (!unknown && (!Number.isSafeInteger(size) || data + size > bytes.length))
		throw new Error('Truncated WebM.')
	return {
		id,
		start,
		data,
		end: unknown ? bytes.length : data + size,
		sizeBytes,
		size: unknown ? Infinity : size,
	}
}
function writeSize(bytes: Uint8Array, field: Element, size: number) {
	const start = field.data - field.sizeBytes
	if (size >= 2 ** (7 * field.sizeBytes) - 1)
		throw new Error('WebM metadata is too large.')
	for (let i = field.sizeBytes - 1; i >= 0; i--) {
		bytes[start + i] = size % 256
		size = Math.floor(size / 256)
	}
	bytes[start] |= 1 << (8 - field.sizeBytes)
}
export function fixWebmDuration(
	bytes: Uint8Array,
	seconds: number,
): Uint8Array {
	if (!Number.isFinite(seconds) || seconds <= 0)
		throw new Error('Invalid video duration.')
	let segment: Element | undefined
	for (let offset = 0; offset < bytes.length; ) {
		const field = element(bytes, offset)
		if (field.id === 0x18538067) {
			segment = field
			break
		}
		offset = field.end
	}
	if (!segment) throw new Error('WebM segment is missing.')
	let info: Element | undefined
	for (let offset = segment.data; offset < segment.end; ) {
		const field = element(bytes, offset)
		if (field.id === 0x114d9b74) return bytes
		if (field.id === 0x1549a966) {
			info = field
			break
		}
		offset = field.end
	}
	if (!info || !Number.isFinite(info.size))
		throw new Error('WebM metadata is missing.')
	let timeScale = 1_000_000
	for (let offset = info.data; offset < info.end; ) {
		const field = element(bytes, offset)
		if (field.id === 0x4489) return bytes
		if (field.id === 0x2ad7b1) {
			timeScale = 0
			for (let i = field.data; i < field.end; i++)
				timeScale = timeScale * 256 + bytes[i]
		}
		offset = field.end
	}
	const duration = new Uint8Array(11)
	duration.set([0x44, 0x89, 0x88])
	new DataView(duration.buffer).setFloat64(
		3,
		(seconds * 1_000_000_000) / timeScale,
	)
	const output = new Uint8Array(bytes.length + duration.length)
	output.set(bytes.subarray(0, info.end))
	output.set(duration, info.end)
	output.set(bytes.subarray(info.end), info.end + duration.length)
	writeSize(output, info, info.size + duration.length)
	if (Number.isFinite(segment.size))
		writeSize(output, segment, segment.size + duration.length)
	return output
}
