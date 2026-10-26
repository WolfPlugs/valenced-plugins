import { expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { uploadFile } from '../plugins/bot-client/uploads'

class Upload extends EventEmitter {
	id = '1'
	filename = 'notes.txt'
	uploadedFilename: string | undefined
	async upload() {
		this.uploadedFilename = 'upload/notes.txt'
		this.emit('complete')
	}
}
test('uploads through Discord and removes completion and error listeners', async () => {
	const file = new Upload()
	expect(await uploadFile(file, 0, new AbortController().signal)).toMatchObject(
		{ id: '0', filename: 'notes.txt', uploaded_filename: 'upload/notes.txt' },
	)
	expect(file.listenerCount('complete')).toBe(0)
	expect(file.listenerCount('error')).toBe(0)
})
test('cancelled uploads do not leave listeners or start uploading', async () => {
	const file = new Upload()
	const controller = new AbortController()
	controller.abort()
	await expect(uploadFile(file, 0, controller.signal)).rejects.toThrow(
		'cancelled',
	)
	expect(file.uploadedFilename).toBeUndefined()
	expect(file.listenerCount('complete')).toBe(0)
	expect(file.listenerCount('error')).toBe(0)
})
