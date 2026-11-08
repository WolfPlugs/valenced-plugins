import { FileModule } from '@valenced/discord/native'
import { finalizeEditedVideo } from './native-bridge'
import { fixWebmDuration } from './video/webm-duration'

// The upload owns a successful export. Interrupted or failed saves remove their cache files.
export async function saveEditorResult({
	message,
	kind,
	isCurrent,
	onEdit,
}: {
	message: unknown
	kind: 'image' | 'video'
	isCurrent(): boolean
	onEdit(item: unknown): void
}) {
	if (
		typeof message !== 'object' ||
		message === null ||
		!('data' in message) ||
		typeof message.data !== 'string' ||
		message.data.length > 90_000_000 ||
		!/^[A-Za-z0-9+/]*={0,2}$/.test(message.data) ||
		!('mime' in message) ||
		!['image/png', 'video/mp4', 'video/webm'].includes(String(message.mime)) ||
		!('width' in message) ||
		typeof message.width !== 'number' ||
		!('height' in message) ||
		typeof message.height !== 'number'
	)
		throw new Error('Invalid media export.')
	const mime = String(message.mime)
	if ((kind === 'image') !== (mime === 'image/png'))
		throw new Error('Unexpected export format.')
	const extension =
		mime === 'image/png' ? 'png' : mime === 'video/mp4' ? 'mp4' : 'webm'
	const filename = `media-utils-${Date.now()}.${extension}`
	const path = `media-utils/${filename}`
	let data = message.data
	if (mime === 'video/webm') {
		if (!('duration' in message) || typeof message.duration !== 'number')
			throw new Error('Missing video duration.')
		const bytes = fixWebmDuration(
			Uint8Array.from(atob(data), c => c.charCodeAt(0)),
			message.duration,
		)
		const chunks: string[] = []
		for (let i = 0; i < bytes.length; i += 8190)
			chunks.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 8190))))
		data = chunks.join('')
	}
	const file = await FileModule.writeFile('cache', path, data, 'base64')
	if (!isCurrent()) {
		await FileModule.removeFile('cache', path)
		return
	}
	let uri = file.startsWith('file://') ? file : `file://${file}`
	let savedPath = path
	try {
		if (mime.startsWith('video/')) {
			uri = await finalizeEditedVideo(uri)
			savedPath = `media-utils/${uri.slice(uri.lastIndexOf('/') + 1)}`
			if (savedPath !== path) await FileModule.removeFile('cache', path)
		}
		if (!isCurrent()) {
			await FileModule.removeFile('cache', savedPath)
			return
		}
		onEdit({
			id: filename,
			uri,
			originalUri: uri,
			filename,
			mimeType: mime,
			width: message.width,
			height: message.height,
			platform: 0,
			origin: 1,
		})
	} catch (error) {
		await FileModule.removeFile('cache', savedPath)
		throw error
	}
}
