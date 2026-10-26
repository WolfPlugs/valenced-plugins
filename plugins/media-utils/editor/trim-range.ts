export function precisionTrimWindow(
	duration: number,
	time: number,
	edge: 'start' | 'end',
) {
	const span = Math.min(duration, Math.max(0.5, duration / 5))
	const from = Math.max(
		0,
		Math.min(duration - span, time - span * (edge === 'start' ? 0.25 : 0.75)),
	)
	return { from, span }
}

export function trimHandleTime(
	origin: number,
	movement: number,
	width: number,
	span: number,
) {
	return origin + (movement / Math.max(1, width)) * span
}
