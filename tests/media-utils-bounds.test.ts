import { expect, test } from 'bun:test'
import { boundImage } from '../plugins/media-utils/viewer/touch-transform'

test('panning stops at image edges and centers axes smaller than the viewport', () => {
	const viewport = { width: 400, height: 800 }
	expect(
		boundImage({ rotation: 0, scale: 2, x: 900, y: -900 }, viewport),
	).toEqual({ rotation: 0, scale: 2, x: 200, y: -400 })
	expect(
		boundImage({ rotation: 0, scale: 2, x: -900, y: 900 }, viewport, {
			width: 800,
			height: 400,
		}),
	).toEqual({ rotation: 0, scale: 2, x: -200, y: 0 })
	expect(boundImage({ rotation: 0, scale: 1, x: 50, y: 50 }, viewport)).toEqual(
		{ rotation: 0, scale: 1, x: 0, y: 0 },
	)
})
