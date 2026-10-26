export type TouchPoint = {
	identifier: string | number
	pageX: number
	pageY: number
}
export type ImageTransform = {
	rotation: number
	scale: number
	x: number
	y: number
}
export const initialTransform = (): ImageTransform => ({
	rotation: 0,
	scale: 1,
	x: 0,
	y: 0,
})

export function moveImage(
	current: ImageTransform,
	previous: readonly TouchPoint[],
	next: readonly TouchPoint[],
	maximumScale: number,
	center: { x: number; y: number } = { x: 0, y: 0 },
): ImageTransform {
	const before = [...previous].sort((a, b) =>
		String(a.identifier).localeCompare(String(b.identifier)),
	)
	const after = [...next].sort((a, b) =>
		String(a.identifier).localeCompare(String(b.identifier)),
	)
	if (
		before.length !== after.length ||
		after.some((point, index) => point.identifier !== before[index]?.identifier)
	)
		return current
	const a = before[0]
	const b = after[0]
	if (!a || !b) return current
	const a2 = before[1]
	const b2 = after[1]
	if (!a2 || !b2)
		return current.scale > 1
			? {
					...current,
					x: current.x + b.pageX - a.pageX,
					y: current.y + b.pageY - a.pageY,
				}
			: current
	const oldX = a2.pageX - a.pageX
	const oldY = a2.pageY - a.pageY
	const newX = b2.pageX - b.pageX
	const newY = b2.pageY - b.pageY
	const distance = Math.hypot(oldX, oldY)
	if (distance < 1) return current
	const delta = Math.atan2(newY, newX) - Math.atan2(oldY, oldX)
	const rotation =
		current.rotation + Math.atan2(Math.sin(delta), Math.cos(delta))
	const scale = Math.max(
		1,
		Math.min(maximumScale, (current.scale * Math.hypot(newX, newY)) / distance),
	)
	const ratio = scale / current.scale
	const turn = rotation - current.rotation
	const oldCenterX = (a.pageX + a2.pageX) / 2 - center.x
	const oldCenterY = (a.pageY + a2.pageY) / 2 - center.y
	const newCenterX = (b.pageX + b2.pageX) / 2 - center.x
	const newCenterY = (b.pageY + b2.pageY) / 2 - center.y
	const anchorX = oldCenterX - current.x
	const anchorY = oldCenterY - current.y
	return {
		rotation,
		scale,
		x:
			scale === 1
				? 0
				: newCenterX -
					ratio * (Math.cos(turn) * anchorX - Math.sin(turn) * anchorY),
		y:
			scale === 1
				? 0
				: newCenterY -
					ratio * (Math.sin(turn) * anchorX + Math.cos(turn) * anchorY),
	}
}
