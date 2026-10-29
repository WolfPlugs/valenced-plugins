export type MediaSource = {
	uri: string
	searchUri: string
	kind: 'image' | 'video'
}
export type ImageSource = MediaSource

export function readMediaSource(value: unknown): MediaSource | undefined {
	if (Array.isArray(value)) value = value[0]
	if (
		typeof value !== 'object' ||
		value === null ||
		!('uri' in value) ||
		typeof value.uri !== 'string'
	)
		return
	const video =
		('videoURI' in value && Boolean(value.videoURI)) ||
		('contentType' in value &&
			typeof value.contentType === 'string' &&
			value.contentType.startsWith('video/'))
	if (
		!video &&
		'contentType' in value &&
		typeof value.contentType === 'string' &&
		value.contentType.length > 0 &&
		!value.contentType.startsWith('image/')
	)
		return
	if (!/^https?:\/\//i.test(value.uri)) return
	const searchUri =
		'sourceURI' in value &&
		typeof value.sourceURI === 'string' &&
		/^https?:\/\//i.test(value.sourceURI)
			? value.sourceURI
			: value.uri
	return { uri: value.uri, searchUri, kind: video ? 'video' : 'image' }
}

export function readImageSource(value: unknown): ImageSource | undefined {
	const source = readMediaSource(value)
	return source?.kind === 'image' ? source : undefined
}

export const searchEngines = {
	'Google Lens': 'https://lens.google.com/uploadbyurl?url=',
	Yandex: 'https://yandex.com/images/search?rpt=imageview&url=',
	SauceNAO: 'https://saucenao.com/search.php?url=',
	IQDB: 'https://iqdb.org/?url=',
	Bing: 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:',
	TinEye: 'https://www.tineye.com/search?url=',
	ImgOps: 'https://imgops.com/start?url=',
}

export function readMediaSize(value: unknown) {
	if (Array.isArray(value)) value = value[0]
	if (
		typeof value !== 'object' ||
		value === null ||
		!('width' in value) ||
		typeof value.width !== 'number' ||
		!Number.isFinite(value.width) ||
		value.width <= 0 ||
		!('height' in value) ||
		typeof value.height !== 'number' ||
		!Number.isFinite(value.height) ||
		value.height <= 0
	)
		return
	return { width: value.width, height: value.height }
}
