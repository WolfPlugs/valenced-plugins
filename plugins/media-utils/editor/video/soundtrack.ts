import { TurboModuleRegistry } from 'react-native'
import { readEditorMedia } from '../media-file'
import type { TurboModule } from 'react-native'

interface DocumentPicker extends TurboModule {
	pick(options: {
		type: string[]
		mode: string
		allowMultiSelection: boolean
	}): Promise<unknown>
}
export async function pickSoundtrack() {
	const picker = TurboModuleRegistry.get<DocumentPicker>('RNDocumentPicker')
	if (!picker) throw new Error('The Android audio picker is unavailable.')
	let response: unknown
	try {
		response = await picker.pick({
			type: ['audio/*'],
			mode: 'import',
			allowMultiSelection: false,
		})
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			typeof error.code === 'string' &&
			/cancel/i.test(error.code)
		)
			return null
		throw error
	}
	const file: unknown = Array.isArray(response) ? response[0] : undefined
	if (
		typeof file !== 'object' ||
		file === null ||
		!('uri' in file) ||
		typeof file.uri !== 'string'
	)
		throw new Error('No audio file was returned.')
	if (
		'size' in file &&
		typeof file.size === 'number' &&
		file.size > 32 * 1024 * 1024
	)
		throw new Error('Choose an audio file under 32 MB.')
	const data = await readEditorMedia(file.uri)
	if (data.length > (32 * 1024 * 1024 * 4) / 3)
		throw new Error('Choose an audio file under 32 MB.')
	return {
		data,
		name:
			'name' in file && typeof file.name === 'string'
				? file.name
				: 'Soundtrack',
		mime:
			'type' in file && typeof file.type === 'string'
				? file.type
				: 'audio/mpeg',
	}
}
