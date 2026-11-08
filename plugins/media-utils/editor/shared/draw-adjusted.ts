import type { Point } from './crop-geometry'
import type { AngleAdjustment } from './transforms'

export function drawAdjusted(
	ctx: CanvasRenderingContext2D,
	adjustedSource: HTMLCanvasElement,
	{ straighten, horizontal, vertical }: AngleAdjustment,
) {
	const canvas = ctx.canvas
	const w = canvas.width,
		h = canvas.height
	const angle = (straighten * Math.PI) / 180
	const cos = Math.cos(angle),
		sin = Math.sin(angle)
	const hx = horizontal / 90,
		vy = vertical / 90
	// Zoom just enough for the inverse of each output corner to stay in the source.
	let zoom = 1
	for (const x of [-1, 1])
		for (const y of [-1, 1]) {
			const u = cos * x + (sin * y * h) / w
			const v = (-sin * x * w) / h + cos * y
			zoom = Math.max(
				zoom,
				Math.abs(u) + hx * u + vy * v,
				Math.abs(v) + hx * u + vy * v,
			)
		}
	if (!horizontal && !vertical) {
		ctx.save()
		ctx.translate(w / 2, h / 2)
		ctx.rotate(angle)
		ctx.scale(zoom, zoom)
		ctx.drawImage(adjustedSource, -w / 2, -h / 2)
		ctx.restore()
		return
	}
	function project(x: number, y: number) {
		const nx = (x * 2) / w - 1,
			ny = (y * 2) / h - 1
		const factor = zoom / (1 + hx * nx + vy * ny)
		const px = ((nx * w) / 2) * factor,
			py = ((ny * h) / 2) * factor
		return { x: w / 2 + cos * px - sin * py, y: h / 2 + sin * px + cos * py }
	}
	function triangle(a: Point, b: Point, c: Point) {
		const p = project(a.x, a.y),
			q = project(b.x, b.y),
			r = project(c.x, c.y)
		const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
		const aa = ((q.x - p.x) * (c.y - a.y) - (r.x - p.x) * (b.y - a.y)) / det
		const bb = ((q.y - p.y) * (c.y - a.y) - (r.y - p.y) * (b.y - a.y)) / det
		const cc = ((r.x - p.x) * (b.x - a.x) - (q.x - p.x) * (c.x - a.x)) / det
		const dd = ((r.y - p.y) * (b.x - a.x) - (q.y - p.y) * (c.x - a.x)) / det
		ctx.save()
		ctx.beginPath()
		// Slightly overlap clips to avoid antialias seams between mesh triangles.
		const center = { x: (p.x + q.x + r.x) / 3, y: (p.y + q.y + r.y) / 3 }
		for (const [i, point] of [p, q, r].entries()) {
			const dx = point.x - center.x,
				dy = point.y - center.y,
				length = Math.hypot(dx, dy)
			const x = point.x + (dx / length) * 0.6,
				y = point.y + (dy / length) * 0.6
			if (i) ctx.lineTo(x, y)
			else ctx.moveTo(x, y)
		}
		ctx.closePath()
		ctx.clip()
		ctx.transform(
			aa,
			bb,
			cc,
			dd,
			p.x - aa * a.x - cc * a.y,
			p.y - bb * a.x - dd * a.y,
		)
		ctx.drawImage(adjustedSource, 0, 0)
		ctx.restore()
	}
	const count = 12
	for (let y = 0; y < count; y++)
		for (let x = 0; x < count; x++) {
			const a = { x: (x * w) / count, y: (y * h) / count },
				b = { x: ((x + 1) * w) / count, y: (y * h) / count }
			const c = { x: (x * w) / count, y: ((y + 1) * h) / count },
				d = { x: ((x + 1) * w) / count, y: ((y + 1) * h) / count }
			triangle(a, b, c)
			triangle(b, d, c)
		}
}
