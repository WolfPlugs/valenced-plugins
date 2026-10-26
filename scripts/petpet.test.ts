import { describe, expect, test } from 'bun:test'
import UPNG from '@pdf-lib/upng'
import { decodePNG, renderPetPet } from '../plugins/petpet/render'

function avatarPNG() {
	const pixels = new Uint8Array(32 * 32 * 4)
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i] = 255
		pixels[i + 3] = 255
	}
	return UPNG.encode([pixels.buffer], 32, 32, 0)
}

describe('local PetPet renderer', () => {
	test('encodes a looping transparent GIF from a decoded PNG', async () => {
		const bytes = await renderPetPet(
			decodePNG(avatarPNG()),
			new AbortController().signal,
		)
		expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a')
		expect(bytes[6] | (bytes[7] << 8)).toBe(128)
		expect(bytes[8] | (bytes[9] << 8)).toBe(128)
		expect(new TextDecoder().decode(bytes)).toContain('NETSCAPE2.0')
		expect(bytes.at(-1)).toBe(0x3b)
	})

	test('rejects non-PNG input and oversized dimensions before decoding', () => {
		expect(() => decodePNG(new ArrayBuffer(24))).toThrow('not a PNG')
		const oversized = avatarPNG()
		new DataView(oversized).setUint32(16, 8192)
		expect(() => decodePNG(oversized)).toThrow('dimensions')
	})

	test('cancels generation when the plugin unloads', async () => {
		const controller = new AbortController()
		const pending = renderPetPet(decodePNG(avatarPNG()), controller.signal)
		controller.abort()
		await expect(pending).rejects.toThrow('cancelled')
	})
})
