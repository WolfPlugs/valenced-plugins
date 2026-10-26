import { FileModule } from '@valenced/discord/native'
import { callNativeMethod } from '@valenced/modules/native'

export async function readEditorMedia(uri: string): Promise<string> {
	const local = uri
	if (/^content:\/\//i.test(uri)) {
		const read = callNativeMethod as (
			name: string,
			args: unknown[],
		) => Promise<unknown>
		const result = await read('wolfie.media-utils.readMedia', [uri])
		if (typeof result !== 'string' || !result)
			throw new Error('Android returned no attachment data.')
		return result
	}
	if (/^file:\/\//i.test(local)) {
		const path = local.replace(/^file:\/\/(?:localhost)?/i, '')
		return FileModule.readFile(decodeURIComponent(path), 'base64')
	}
	if (local.startsWith('/')) return FileModule.readFile(local, 'base64')
	if (/^https?:\/\//i.test(local)) return FileModule.readAsset(local, 'base64')
	throw new Error(
		'Unsupported attachment URI. Choose a local image or video file.',
	)
}
