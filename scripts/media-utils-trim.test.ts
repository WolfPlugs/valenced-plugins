import { expect, test } from 'bun:test'
import {
	precisionTrimWindow,
	trimHandleTime,
} from '../plugins/media-utils/editor/trim-range'

test('holding a handle magnifies its endpoint without going outside the clip', () => {
	expect(precisionTrimWindow(100, 0, 'start')).toEqual({ from: 0, span: 20 })
	expect(precisionTrimWindow(100, 100, 'end')).toEqual({ from: 80, span: 20 })
	const zoom = precisionTrimWindow(100, 50, 'start')
	expect(zoom).toEqual({ from: 45, span: 20 })
	expect(trimHandleTime(50, 10, 200, 100)).toBe(55)
	expect(trimHandleTime(50, 10, 200, zoom.span)).toBe(51)
	expect(trimHandleTime(50, 0, 200, zoom.span)).toBe(50)
	expect(precisionTrimWindow(0.2, 0.1, 'end')).toEqual({ from: 0, span: 0.2 })
})
