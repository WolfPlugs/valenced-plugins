export type Settings = {
	doubleTapZoom: number
	smoothZoom: boolean
	rotateImages: boolean
	rotateVideos: boolean
	zoomEnabled: boolean
	fullResolution: boolean
	favoriteMedia: boolean
}
export const defaultSettings: Settings = {
	doubleTapZoom: 5,
	smoothZoom: false,
	rotateImages: true,
	rotateVideos: true,
	zoomEnabled: true,
	fullResolution: true,
	favoriteMedia: true,
}
export type SettingsStore = {
	cache?: unknown
	use(): unknown
	set(settings: Partial<Settings>): unknown
}
export function readSettings(value: unknown): Settings {
	const settings = typeof value === 'object' && value !== null ? value : {}
	const zoom = 'doubleTapZoom' in settings ? settings.doubleTapZoom : undefined
	return {
		doubleTapZoom:
			typeof zoom === 'number' && Number.isFinite(zoom)
				? Math.max(2, Math.min(10, Math.round(zoom)))
				: 5,
		smoothZoom:
			'smoothZoom' in settings && typeof settings.smoothZoom === 'boolean'
				? settings.smoothZoom
				: false,
		rotateImages:
			'rotateImages' in settings && typeof settings.rotateImages === 'boolean'
				? settings.rotateImages
				: true,
		rotateVideos:
			'rotateVideos' in settings && typeof settings.rotateVideos === 'boolean'
				? settings.rotateVideos
				: true,
		zoomEnabled:
			'zoomEnabled' in settings && typeof settings.zoomEnabled === 'boolean'
				? settings.zoomEnabled
				: true,
		fullResolution:
			'fullResolution' in settings &&
			typeof settings.fullResolution === 'boolean'
				? settings.fullResolution
				: true,
		favoriteMedia:
			'favoriteMedia' in settings && typeof settings.favoriteMedia === 'boolean'
				? settings.favoriteMedia
				: true,
	}
}
export const doubleTapZoom = (value: unknown) =>
	readSettings(value).doubleTapZoom
