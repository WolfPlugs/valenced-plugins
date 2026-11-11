import { callNativeMethod } from '@valenced/modules/native'

export async function finalizeEditedVideo(uri: string): Promise<string> {
	const call = callNativeMethod as (
		name: string,
		args: unknown[],
	) => Promise<unknown>
	const result = await call('wolfie.media-utils.finalizeVideo', [uri])
	if (typeof result !== 'string' || !result.startsWith('content://'))
		throw new Error('Android could not finalize the edited video for upload.')
	return result
}
