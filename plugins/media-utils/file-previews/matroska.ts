import type { ByteReader } from './formats'

// Only read the header and track metadata. Playback streams the original URL.
const headerLimit = 256 * 1024

export async function matroskaDimensions(read: ByteReader) {
	const bytes = await read(0, headerLimit)

	function vint(offset: number, end: number, size: boolean) {
		if (offset >= end) return
		const first = bytes[offset]
		if (!first) return
		const length = Math.clz32(first) - 23
		if (offset + length > end || (!size && length > 4)) return
		let value = size ? first & (0xff >>> length) : first
		let unknown = size && value === 0xff >>> length
		for (let i = 1; i < length; i++) {
			const byte = bytes[offset + i]
			value = value * 256 + byte
			unknown &&= byte === 255
		}
		return { length, value, unknown }
	}

	function* elements(start: number, end: number, allowOpenSegment = false) {
		let offset = start
		while (offset < end) {
			const id = vint(offset, end, false)
			if (!id) return
			const size = vint(offset + id.length, end, true)
			if (!size) return
			const from = offset + id.length + size.length
			const segment = allowOpenSegment && id.value === 0x18538067
			if (size.unknown && !segment) return
			const to = size.unknown ? end : from + size.value
			if (to > end && !segment) return
			yield { id: id.value, from, to: Math.min(to, end) }
			offset = to
		}
	}

	function integer(from: number, to: number) {
		if (to - from > 4) return 0
		let value = 0
		for (let i = from; i < to; i++) value = value * 256 + bytes[i]
		return value
	}

	const root = elements(0, bytes.length, true)
	if (root.next().value?.id !== 0x1a45dfa3) return
	for (const segment of root) {
		if (segment.id !== 0x18538067) continue
		for (const tracks of elements(segment.from, segment.to)) {
			if (tracks.id !== 0x1654ae6b) continue
			for (const entry of elements(tracks.from, tracks.to)) {
				if (entry.id !== 0xae) continue
				let video = false
				let width = 0
				let height = 0
				for (const field of elements(entry.from, entry.to)) {
					if (field.id === 0x83) video = integer(field.from, field.to) === 1
					if (field.id !== 0xe0) continue
					for (const dimension of elements(field.from, field.to)) {
						if (dimension.id === 0xb0)
							width = integer(dimension.from, dimension.to)
						if (dimension.id === 0xba)
							height = integer(dimension.from, dimension.to)
					}
				}
				if (
					video &&
					width > 0 &&
					height > 0 &&
					width <= 16384 &&
					height <= 16384
				)
					return { width, height }
			}
		}
	}
}
