export type Upload = {
	id: string
	filename: string
	uploadedFilename?: string
	description?: string | null
	spoiler?: boolean
	upload(): Promise<unknown>
	once(event: string, listener: (value: unknown) => void): void
	removeListener(event: string, listener: (value: unknown) => void): void
}

export async function uploadAttachment(file: Upload, index: number) {
	await new Promise<void>((resolve, reject) => {
		const finish = (error?: Error) => {
			clearTimeout(timer)
			file.removeListener('complete', complete)
			file.removeListener('error', fail)
			if (error) reject(error)
			else resolve()
		}
		const complete = () => finish()
		const fail = () => finish(new Error(`Could not upload ${file.filename}.`))
		const timer = setTimeout(
			() =>
				finish(new Error(`Uploading ${file.filename} timed out. Try again.`)),
			120_000,
		)
		file.once('complete', complete)
		file.once('error', fail)
		try {
			void file.upload().catch(fail)
		} catch {
			fail()
		}
	})
	if (!file.uploadedFilename)
		throw new Error(`Discord did not return an upload for ${file.filename}.`)
	return {
		id: String(index),
		filename:
			file.spoiler && !file.filename.startsWith('SPOILER_')
				? `SPOILER_${file.filename}`
				: file.filename,
		uploaded_filename: file.uploadedFilename,
		description: file.description,
	}
}
