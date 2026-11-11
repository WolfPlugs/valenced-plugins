import type { Point } from '../shared/crop-geometry'

export type LayerTransform = Point & { angle: number; scale: number }
type Bounds = { width: number; height: number }
type Handle = Point & { action: 'resize' | 'rotate' | 'delete' }

export function layerPoint(layer: LayerTransform, x: number, y: number): Point {
	const cos = Math.cos(layer.angle)
	const sin = Math.sin(layer.angle)
	return { x: layer.x + cos * x - sin * y, y: layer.y + sin * x + cos * y }
}

export function layerContains(
	layer: LayerTransform,
	bounds: Bounds,
	point: Point,
	padding: number,
) {
	const dx = point.x - layer.x
	const dy = point.y - layer.y
	const cos = Math.cos(layer.angle)
	const sin = Math.sin(layer.angle)
	return (
		Math.abs(cos * dx + sin * dy) <=
			(bounds.width * layer.scale) / 2 + padding &&
		Math.abs(-sin * dx + cos * dy) <=
			(bounds.height * layer.scale) / 2 + padding
	)
}

export function layerSelection(
	layer: LayerTransform,
	bounds: Bounds,
	unit: number,
	width: number,
	height: number,
) {
	const x = Math.max(15 * unit, (bounds.width * layer.scale) / 2 + 5 * unit)
	const y = Math.max(15 * unit, (bounds.height * layer.scale) / 2 + 5 * unit)
	const corners = [
		[-x, -y],
		[x, -y],
		[x, y],
		[-x, y],
	].map(([dx, dy]) => layerPoint(layer, dx, dy))
	const toolbar = layerPoint(layer, 0, -y - 23 * unit)
	const clamp = (value: number, dimension: number, inset: number) =>
		Math.min(dimension - inset, Math.max(inset, value))
	const inset = Math.min(width / 2, height / 2, 12 * unit)
	const handles: Handle[] = corners.map(corner => ({
		action: 'resize',
		x: clamp(corner.x, width, inset),
		y: clamp(corner.y, height, inset),
	}))
	const toolX = clamp(toolbar.x, width, Math.min(width / 2, 31 * unit))
	const toolY = clamp(toolbar.y, height, inset)
	handles.push(
		{ action: 'rotate', x: toolX - 15 * unit, y: toolY },
		{ action: 'delete', x: toolX + 15 * unit, y: toolY },
	)
	return { corners, handles }
}

export function drawLayerSelection(
	ctx: CanvasRenderingContext2D,
	selection: ReturnType<typeof layerSelection>,
	unit: number,
) {
	ctx.save()
	ctx.beginPath()
	selection.corners.forEach(({ x, y }, i) =>
		i ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
	)
	ctx.closePath()
	ctx.strokeStyle = '#000b'
	ctx.lineWidth = 3 * unit
	ctx.stroke()
	ctx.strokeStyle = '#fff'
	ctx.lineWidth = unit
	ctx.stroke()
	for (const { x, y, action } of selection.handles) {
		ctx.save()
		ctx.translate(x, y)
		ctx.scale(unit, unit)
		ctx.beginPath()
		ctx.arc(0, 0, action === 'resize' ? 5 : 12, 0, 2 * Math.PI)
		ctx.fillStyle = '#fff'
		ctx.fill()
		ctx.strokeStyle = '#17171c'
		ctx.lineWidth = 1
		ctx.stroke()
		ctx.beginPath()
		ctx.lineWidth = 1.5
		if (action === 'delete') {
			ctx.moveTo(-5, -3)
			ctx.lineTo(5, -3)
			ctx.moveTo(-2, -3)
			ctx.lineTo(-2, -5)
			ctx.lineTo(2, -5)
			ctx.lineTo(2, -3)
			ctx.moveTo(-4, -1)
			ctx.lineTo(-3, 5)
			ctx.lineTo(3, 5)
			ctx.lineTo(4, -1)
		} else if (action === 'rotate') {
			ctx.arc(0, 0, 5, -Math.PI / 2, Math.PI)
			ctx.moveTo(-7, -2)
			ctx.lineTo(-5, 1)
			ctx.lineTo(-2, -1)
		}
		ctx.stroke()
		ctx.restore()
	}
	ctx.restore()
}
