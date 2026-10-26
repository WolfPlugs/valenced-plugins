import { Dispatcher } from '@valenced/discord/common/flux'
import { FileModule } from '@valenced/discord/native'

export async function attachPetPet(
	bytes: Uint8Array,
	channelId: string,
	isCurrent: () => boolean,
) {
	if (!isCurrent()) return
	const chunks: string[] = []
	for (let offset = 0; offset < bytes.length; offset += 8190)
		chunks.push(
			btoa(String.fromCharCode(...bytes.subarray(offset, offset + 8190))),
		)
	const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
	const path = `petpet/${id}.gif`
	const filePath = await FileModule.writeFile(
		'cache',
		path,
		chunks.join(''),
		'base64',
	)
	let queued = false
	try {
		if (!isCurrent()) return
		if (!filePath) throw new Error('Could not save the PetPet GIF.')
		const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
		Dispatcher.dispatch({
			type: 'UPLOAD_ATTACHMENT_ADD_FILES',
			channelId,
			draftType: 0,
			allowOptimization: false,
			files: [
				{
					id,
					uri,
					originalUri: uri,
					filename: 'petpet.gif',
					mimeType: 'image/gif',
					width: 128,
					height: 128,
					platform: 0,
					origin: 1,
				},
			],
		})
		queued = true
	} finally {
		if (!queued) await FileModule.removeFile('cache', path)
	}
}
