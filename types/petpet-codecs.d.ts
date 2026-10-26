declare module 'gifenc' {
	export function quantize(
		pixels: Uint8Array,
		colors: number,
		options: { format: 'rgba4444'; oneBitAlpha: boolean },
	): number[][]
	export function applyPalette(
		pixels: Uint8Array,
		palette: number[][],
		format: 'rgba4444',
	): Uint8Array
	export function GIFEncoder(): {
		writeFrame(
			pixels: Uint8Array,
			width: number,
			height: number,
			options: {
				palette: number[][]
				delay: number
				repeat: number
				dispose: number
				transparent: boolean
				transparentIndex: number
			},
		): void
		finish(): void
		bytes(): Uint8Array
	}
}
