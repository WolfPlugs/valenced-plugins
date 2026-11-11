import type { Point } from '../shared/crop-geometry'
import type { Brush, TextStyle } from '../shared/markup'

export type Stroke = {
	brush: Brush
	points: Point[]
	color: string
	size: number
}

export function createInkRenderer() {
	const ink = document.createElement('canvas')
	const pixels = document.createElement('canvas')
	let cached:
		| { last: Stroke; count: number; points: number; source: string }
		| undefined
	return (
		target: CanvasRenderingContext2D,
		strokes: Stroke[],
		source: string,
		stageWidth: number,
		stageHeight: number,
	) => {
		const last = strokes.at(-1)
		if (!last) return
		const { width, height } = target.canvas
		if (
			ink.width === width &&
			ink.height === height &&
			cached?.last === last &&
			cached.count === strokes.length &&
			cached.points === last.points.length &&
			cached.source === source
		) {
			target.drawImage(ink, 0, 0, stageWidth, stageHeight)
			return
		}
		if (ink.width !== width || ink.height !== height) {
			ink.width = width
			ink.height = height
		}
		const ctx = ink.getContext('2d')!
		ctx.setTransform(width / stageWidth, 0, 0, height / stageHeight, 0, 0)
		ctx.clearRect(0, 0, stageWidth, stageHeight)
		ctx.lineCap = ctx.lineJoin = 'round'
		let mosaic: CanvasPattern | null = null
		if (strokes.some(stroke => stroke.brush === 'mosaic')) {
			const cell = Math.max(4, stageWidth / 36)
			pixels.width = Math.max(1, Math.round(stageWidth / cell))
			pixels.height = Math.max(1, Math.round(stageHeight / cell))
			pixels
				.getContext('2d')!
				.drawImage(target.canvas, 0, 0, pixels.width, pixels.height)
			mosaic = ctx.createPattern(pixels, 'no-repeat')
			mosaic?.setTransform(
				new DOMMatrix().scale(
					stageWidth / pixels.width,
					stageHeight / pixels.height,
				),
			)
		}
		ctx.imageSmoothingEnabled = false
		for (const { brush, points, color, size } of strokes) {
			const first = points[0]
			if (!first) continue
			ctx.globalCompositeOperation =
				brush === 'eraser' ? 'destination-out' : 'source-over'
			ctx.globalAlpha = brush === 'highlighter' ? 0.35 : 1
			ctx.strokeStyle =
				brush === 'eraser'
					? '#000'
					: brush === 'mosaic' && mosaic
						? mosaic
						: color
			ctx.lineWidth = size * (brush === 'pen' ? 1 : 2)
			ctx.beginPath()
			ctx.moveTo(first.x, first.y)
			ctx.lineTo(first.x + 0.01, first.y)
			for (let i = 1; i < points.length; i++)
				ctx.lineTo(points[i].x, points[i].y)
			ctx.stroke()
		}
		ctx.globalCompositeOperation = 'source-over'
		ctx.globalAlpha = 1
		cached = { last, count: strokes.length, points: last.points.length, source }
		target.drawImage(ink, 0, 0, stageWidth, stageHeight)
	}
}

export function textLayout(
	ctx: CanvasRenderingContext2D,
	layer: Point & { text: string; size: number; style: TextStyle },
) {
	ctx.font = `${layer.size}px ${layer.style.font}`
	const lines = layer.text.split('\n')
	const lineHeight = layer.size * 1.2
	const width = Math.max(...lines.map(line => ctx.measureText(line).width))
	const height = lineHeight * lines.length
	return { lines, lineHeight, width, height }
}

export function drawText(
	ctx: CanvasRenderingContext2D,
	layer: Parameters<typeof textLayout>[1],
) {
	ctx.save()
	const { lines, lineHeight, width, height } = textLayout(ctx, layer)
	const { x, y, size, style } = layer
	const { color, align, border } = style
	ctx.fillStyle = color
	if (border === 'opaque' || border === 'translucent') {
		const pad = size * 0.25
		ctx.globalAlpha = border === 'opaque' ? 1 : 0.55
		ctx.fillRect(
			x - width / 2 - pad,
			y - height / 2 - pad,
			width + pad * 2,
			height + pad * 2,
		)
		ctx.globalAlpha = 1
		const rgb = Number.parseInt(color.slice(1), 16)
		const brightness =
			((rgb >> 16) & 255) * 0.299 +
			((rgb >> 8) & 255) * 0.587 +
			(rgb & 255) * 0.114
		ctx.fillStyle = brightness > 150 ? '#000000' : '#ffffff'
	} else if (border === 'shadow') {
		ctx.shadowColor = color === '#000000' ? '#ffffff' : '#000000'
		ctx.shadowBlur = size * 0.2
		ctx.shadowOffsetY = size * 0.1
	}
	ctx.textAlign = align
	ctx.textBaseline = 'middle'
	const left =
		x + (align === 'left' ? -width / 2 : align === 'right' ? width / 2 : 0)
	lines.forEach((line, i) =>
		ctx.fillText(line, left, y - height / 2 + (i + 0.5) * lineHeight),
	)
	ctx.restore()
}
