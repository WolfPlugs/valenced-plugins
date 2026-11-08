export type AngleAdjustment = {
	straighten: number
	horizontal: number
	vertical: number
}
export function defaultAdjustment(): AngleAdjustment {
	return { straighten: 0, horizontal: 0, vertical: 0 }
}
export function originalAspectRatio(sourceRatio: number, quarterTurns: number) {
	return quarterTurns % 2 ? 1 / sourceRatio : sourceRatio
}
export function orientRatio(ratio: number, landscape: boolean) {
	return landscape ? Math.max(ratio, 1 / ratio) : Math.min(ratio, 1 / ratio)
}
