export type PendingUpload = {
	id: string
	filename: string
	uploadedFilename?: string
	description?: string | null
	spoiler?: boolean
	upload(): Promise<unknown>
	once(event: string, listener: () => void): void
	removeListener(event: string, listener: () => void): void
}
export function uploadName(file: PendingUpload) {
	return file.spoiler && !file.filename.startsWith('SPOILER_')
		? `SPOILER_${file.filename}`
		: file.filename
}
export async function uploadFile(
	file: PendingUpload,
	index: number,
	signal: AbortSignal,
) {
	if (!file.uploadedFilename)
		await new Promise<void>((resolve, reject) => {
			let finished = false
			const finish = (error?: Error) => {
				if (finished) return
				finished = true
				clearTimeout(timer)
				file.removeListener('complete', complete)
				file.removeListener('error', fail)
				signal.removeEventListener('abort', abort)
				if (error) reject(error)
				else resolve()
			}
			const complete = () => finish()
			const fail = () => finish(new Error(`Could not upload ${file.filename}.`))
			const abort = () => finish(new Error('Upload cancelled.'))
			const timer = setTimeout(
				() => finish(new Error(`Uploading ${file.filename} timed out.`)),
				120000,
			)
			file.once('complete', complete)
			file.once('error', fail)
			signal.addEventListener('abort', abort, { once: true })
			if (signal.aborted) {
				abort()
				return
			}
			try {
				void file.upload().catch(fail)
			} catch {
				fail()
			}
		})
	if (signal.aborted) throw new Error('Upload cancelled.')
	if (!file.uploadedFilename)
		throw new Error(`Discord did not return an upload for ${file.filename}.`)
	return {
		id: String(index),
		filename: uploadName(file),
		uploaded_filename: file.uploadedFilename,
		description: file.description,
	}
}
