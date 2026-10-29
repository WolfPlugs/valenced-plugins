import { expect, test } from 'bun:test'
import {
	boundImage,
	initialTransform,
	isPointOnImage,
} from '../plugins/media-utils/viewer/touch-transform'

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

test('double taps outside the fitted image are ignored', () => {
	const viewport = { width: 400, height: 800 }
	const image = { width: 800, height: 400 }
	expect(
		isPointOnImage({ x: 200, y: 100 }, initialTransform(), viewport, image),
	).toBe(false)
	expect(
		isPointOnImage({ x: 200, y: 400 }, initialTransform(), viewport, image),
	).toBe(true)
	expect(
		isPointOnImage({ x: 200, y: 300 }, initialTransform(), viewport, image),
	).toBe(true)
	expect(
		isPointOnImage({ x: 200, y: 299 }, initialTransform(), viewport, image),
	).toBe(false)
	expect(
		isPointOnImage(
			{ x: 50, y: 400 },
			{ rotation: Math.PI / 2, scale: 1, x: 0, y: 0 },
			viewport,
			image,
		),
	).toBe(false)
	expect(
		isPointOnImage(
			{ x: 350, y: 400 },
			{ rotation: 0, scale: 2, x: -300, y: 0 },
			viewport,
			image,
		),
	).toBe(false)
})
