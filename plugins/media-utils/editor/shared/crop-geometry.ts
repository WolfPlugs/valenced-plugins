export type Point = { x: number; y: number }
export type CropBox = Point & { width: number; height: number }
export type CropDrag = {
	box: CropBox
	left: boolean
	right: boolean
	top: boolean
	bottom: boolean
	move: boolean
}

export function moveCrop(
	box: CropBox,
	dx: number,
	dy: number,
	drag: CropDrag,
	bounds: { width: number; height: number; displayWidth: number },
	cropRatio: number,
): CropBox {
	const clamp = (value: number, low: number, high: number) =>
		Math.max(low, Math.min(high, value))
	const minimum = Math.min(
		bounds.width,
		bounds.height,
		(24 * bounds.width) / Math.max(1, bounds.displayWidth),
	)
	if (drag.move)
		return {
			...box,
			x: clamp(box.x + dx, 0, bounds.width - box.width),
			y: clamp(box.y + dy, 0, bounds.height - box.height),
		}
	if (cropRatio > 0) {
		const sx = drag.left ? -1 : 1,
			sy = drag.top ? -1 : 1
		const horizontal = drag.left || drag.right,
			vertical = drag.top || drag.bottom
		const ax = horizontal
			? drag.left
				? box.x + box.width
				: box.x
			: box.x + box.width / 2
		const ay = vertical
			? drag.top
				? box.y + box.height
				: box.y
			: box.y + box.height / 2
		const maxWidth = Math.min(
			horizontal
				? sx < 0
					? ax
					: bounds.width - ax
				: 2 * Math.min(ax, bounds.width - ax),
			(vertical
				? sy < 0
					? ay
					: bounds.height - ay
				: 2 * Math.min(ay, bounds.height - ay)) * cropRatio,
		)
		const proposed =
			horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy * cropRatio))
				? box.width + sx * dx
				: (box.height + sy * dy) * cropRatio
		const w = clamp(
				proposed,
				Math.min(maxWidth, minimum * Math.max(1, cropRatio)),
				maxWidth,
			),
			h = w / cropRatio
		return {
			x: horizontal ? ax - (sx < 0 ? w : 0) : ax - w / 2,
			y: vertical ? ay - (sy < 0 ? h : 0) : ay - h / 2,
			width: w,
			height: h,
		}
	}
	const x1 = drag.left
		? clamp(box.x + dx, 0, box.x + box.width - Math.min(minimum, box.width))
		: box.x
	const y1 = drag.top
		? clamp(box.y + dy, 0, box.y + box.height - Math.min(minimum, box.height))
		: box.y
	const x2 = drag.right
		? clamp(
				box.x + box.width + dx,
				x1 + Math.min(minimum, box.width),
				bounds.width,
			)
		: box.x + box.width
	const y2 = drag.bottom
		? clamp(
				box.y + box.height + dy,
				y1 + Math.min(minimum, box.height),
				bounds.height,
			)
		: box.y + box.height
	return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}
