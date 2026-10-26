import { expect, test } from 'bun:test'
import { fixWebmDuration } from '../plugins/media-utils/editor/webm-duration'

const fixture = new Uint8Array([
	0x18, 0x53, 0x80, 0x67, 0xff, 0x15, 0x49, 0xa9, 0x66, 0x87, 0x2a, 0xd7, 0xb1,
	0x83, 0x0f, 0x42, 0x40, 0x1f, 0x43, 0xb6, 0x75, 0x80,
])
test('records duration without changing the encoded video', () => {
	const fixed = fixWebmDuration(fixture, 2.5)
	expect(fixed.length).toBe(fixture.length + 11)
	expect(new DataView(fixed.buffer).getFloat64(20)).toBe(2500)
	expect(fixed.subarray(-5)).toEqual(fixture.subarray(-5))
	expect(fixWebmDuration(fixed, 2.5)).toEqual(fixed)
})
test('rejects invalid export metadata and truncated containers', () => {
	expect(() => fixWebmDuration(fixture, NaN)).toThrow()
	expect(() => fixWebmDuration(fixture, -1)).toThrow()
	expect(() => fixWebmDuration(fixture.subarray(0, 12), 1)).toThrow()
})
