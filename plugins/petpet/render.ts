import UPNG from '@pdf-lib/upng'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { handFrames } from './hand-frames'

type Image = { width: number; height: number; pixels: Uint8Array }
const resolution = 128

export function decodePNG(buffer: ArrayBuffer): Image {
	const bytes = new Uint8Array(buffer)
	const signature = [137, 80, 78, 71, 13, 10, 26, 10]
	if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte))
		throw new Error('The avatar is not a PNG image.')
	const header = new DataView(buffer)
	const width = header.getUint32(16)
	const height = header.getUint32(20)
	if (!width || !height || width > 512 || height > 512)
		throw new Error('The avatar image dimensions are unsupported.')
	const png = UPNG.decode(buffer)
	const frame = UPNG.toRGBA8(png)[0]
	if (!frame || frame.byteLength !== width * height * 4)
		throw new Error('Could not decode the avatar.')
	return { width, height, pixels: new Uint8Array(frame) }
}

let hands: Image[] | undefined

function getHands() {
	hands ??= handFrames.map(base64 => {
		const binary = atob(base64)
		const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
		return decodePNG(bytes.buffer)
	})
	return hands
}

function draw(
	target: Uint8Array,
	image: Image,
	left: number,
	top: number,
	width: number,
	height: number,
) {
	for (
		let y = Math.max(0, Math.ceil(top));
		y < Math.min(resolution, top + height);
		y++
	) {
		for (
			let x = Math.max(0, Math.ceil(left));
			x < Math.min(resolution, left + width);
			x++
		) {
			const sx = Math.min(
				image.width - 1,
				Math.floor(((x - left) / width) * image.width),
			)
			const sy = Math.min(
				image.height - 1,
				Math.floor(((y - top) / height) * image.height),
			)
			const source = (sy * image.width + sx) * 4
			const dest = (y * resolution + x) * 4
			const alpha = image.pixels[source + 3] / 255
			const behind = (target[dest + 3] / 255) * (1 - alpha)
			const combined = alpha + behind
			if (!combined) continue
			for (let c = 0; c < 3; c++)
				target[dest + c] = Math.round(
					(image.pixels[source + c] * alpha + target[dest + c] * behind) /
						combined,
				)
			target[dest + 3] = Math.round(combined * 255)
		}
	}
}

export async function renderPetPet(
	avatar: Image,
	signal: AbortSignal,
): Promise<Uint8Array> {
	const frames = getHands()
	const gif = GIFEncoder()
	for (let i = 0; i < 10; i++) {
		await new Promise(resolve => setTimeout(resolve, 0))
		if (signal.aborted) throw new Error('PetPet generation cancelled.')
		const pixels = new Uint8Array(resolution * resolution * 4)
		const squash = i < 5 ? i : 10 - i
		const width = 0.8 + squash * 0.02
		const height = 0.8 - squash * 0.05
		draw(
			pixels,
			avatar,
			((1 - width) * 0.5 + 0.1) * resolution,
			(1 - height - 0.08) * resolution,
			width * resolution,
			height * resolution,
		)
		draw(pixels, frames[Math.floor(i / 2)], 0, 0, resolution, resolution)
		const palette = quantize(pixels, 256, {
			format: 'rgba4444',
			oneBitAlpha: true,
		})
		const transparentIndex = palette.findIndex(color => color[3] === 0)
		gif.writeFrame(
			applyPalette(pixels, palette, 'rgba4444'),
			resolution,
			resolution,
			{
				palette,
				delay: 20,
				repeat: 0,
				dispose: 2,
				transparent: transparentIndex !== -1,
				transparentIndex: Math.max(0, transparentIndex),
			},
		)
	}
	gif.finish()
	return gif.bytes()
}
