import { afterEach, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import type { Upload } from '../plugins/add-attachments/upload'

type Request = { url: string; body: Record<string, unknown> }
const url = '/channels/123/messages/456'
let files: Upload[] = []
let requests: Request[] = []
let originalAttachments = [{ id: '999', filename: 'old.png' }]
let rejectRequest = false
let inFlight: Promise<unknown> | undefined
const cleanups: (() => void)[] = []
const events: Record<string, unknown>[] = []
const errors: unknown[] = []
const http = {
	patch(
		request: Request,
		callback: (response: {
			hasErr: boolean
			status: number
			body?: unknown
		}) => void,
	) {
		queueMicrotask(() => {
			if (rejectRequest)
				callback({
					hasErr: true,
					status: 500,
					body: { message: 'Network failed' },
				})
			else {
				requests.push(request)
				callback({ hasErr: false, status: 200, body: { id: '456' } })
			}
		})
	},
}
const actions = {
	startEditMessage() {},
	editMessage(
		channelId: string,
		messageId: string,
		body: Record<string, unknown>,
	) {
		inFlight = new Promise((resolve, reject) => {
			http.patch(
				{ url: `/channels/${channelId}/messages/${messageId}`, body },
				response => {
					if (response.hasErr)
						reject(new Error((response.body as { message: string }).message))
					else resolve(response)
				},
			)
		})
		return Promise.resolve()
	},
}
let nativeSaves = 0
let cancellations = 0
const input = {
	handleSaveEditing(text: string) {
		nativeSaves++
		if (text !== 'original')
			actions.editMessage('123', '456', { content: text })
	},
	handleCancelEditing() {
		cancellations++
	},
}
const refs = {
	chatInput: { current: input },
	props: { current: { channel: { id: '123' } } },
}
const hook = { default: () => refs }
let onHTTPReady: ((value: { HTTP: typeof http }) => void) | undefined
mock.module('@valenced/discord/actions', () => ({
	ToastActionCreators: { open() {} },
}))
mock.module('@valenced/discord/common/flux', () => ({
	Dispatcher: {
		dispatch(event: Record<string, unknown>) {
			events.push(event)
			if (event.type === 'UPLOAD_ATTACHMENT_SET_UPLOADS')
				files = event.uploads as Upload[]
			else files = files.filter(file => file.id !== event.id)
		},
	},
}))
mock.module('@valenced/discord/flux', () => ({
	withStoreName: (name: string) => name,
}))
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: (...props: string[]) => props,
	withName: (name: string) => name,
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule(filter: unknown) {
		if (filter === 'UploadAttachmentStore') return [{ getUploads: () => files }]
		if (filter === 'MessageStore')
			return [{ getMessage: () => ({ attachments: originalAttachments }) }]
		if (filter === 'EditMessageStore')
			return [
				{
					getEditingMessage: () => ({ id: '456', content: 'original' }),
					getEditingTextValue: () => 'original',
				},
			]
		if (Array.isArray(filter) && filter.includes('editMessage'))
			return [actions]
		return []
	},
	getModules(filter: unknown, callback: (value: unknown) => void) {
		if (Array.isArray(filter) && filter.includes('HTTP')) onHTTPReady = callback
		else callback(filter === 'useChatInputRefs' ? hook : actions)
		return () => {}
	},
}))
mock.module('@valenced/patcher', () => ({
	after(
		object: Record<string, (...args: unknown[]) => unknown>,
		key: string,
		patch: (value: unknown) => unknown,
	) {
		const original = object[key]
		object[key] = (...args: unknown[]) => patch(original(...args))
		return () => {
			object[key] = original
		}
	},
	instead(
		object: Record<string, (...args: unknown[]) => unknown>,
		key: string,
		patch: (
			this: unknown,
			args: unknown[],
			original: (...args: unknown[]) => unknown,
		) => unknown,
	) {
		const original = object[key]
		object[key] = function (...args: unknown[]) {
			return patch.call(this, args, original)
		}
		return () => {
			object[key] = original
		}
	},
}))
Object.assign(globalThis, { plugin: (value: unknown) => value })
const { default: plugin } = await import('../plugins/add-attachments/index')
plugin.start({
	cleanup: (fn: () => void) => cleanups.push(fn),
	plugin: { reportError: (error: unknown) => errors.push(error) },
} as never)
hook.default()
test('starts before HTTP loads and hooks it when available', () => {
	expect(onHTTPReady).toBeTypeOf('function')
	expect(errors).toHaveLength(0)
	onHTTPReady?.({ HTTP: http })
})

function file(fail = false): Upload {
	const emitter = new EventEmitter()
	return Object.assign(emitter, {
		id: 'file:///image.png',
		filename: 'image.png',
		uploadedFilename: '',
		spoiler: true,
		async upload() {
			await Promise.resolve()
			if (fail) {
				emitter.emit('error', new Error('Upload failed'))
				return
			}
			this.uploadedFilename = 'uploads/image.png'
			emitter.emit('complete')
		},
	})
}
async function edit(
	body = { content: 'edited', allowed_mentions: { parse: [] } },
) {
	await actions.editMessage('123', '456', body)
	await inFlight
}
afterEach(() => {
	files = []
	requests = []
	events.length = 0
	errors.length = 0
	rejectRequest = false
	originalAttachments = [{ id: '999', filename: 'old.png' }]
})
test('uploads on save, preserves existing attachments and text, then clears only sent files', async () => {
	const upload = file()
	files = [upload]
	const saving = edit()
	expect(files).toHaveLength(0)
	expect(requests).toHaveLength(0)
	const later = file()
	later.id = 'later'
	files.push(later)
	await saving
	expect(requests[0]).toEqual({
		url,
		body: {
			content: 'edited',
			allowed_mentions: { parse: [] },
			attachments: [
				originalAttachments[0],
				{
					id: '0',
					filename: 'SPOILER_image.png',
					uploaded_filename: 'uploads/image.png',
					description: undefined,
				},
			],
		},
	})
	expect(files).toEqual([later])
	expect(upload.listenerCount('error')).toBe(0)
})
test('plain edits pass through', async () => {
	await edit()
	expect(requests[0].body).not.toHaveProperty('attachments')
	expect(events).toHaveLength(0)
})
test('upload failure keeps the tray and does not submit the edit', async () => {
	files = [file(true)]
	await expect(edit()).rejects.toThrow('Could not upload')
	expect(files).toHaveLength(1)
	expect(requests).toHaveLength(0)
	expect(errors).toHaveLength(1)
})
test('request failure keeps files and allows retry', async () => {
	files = [file()]
	rejectRequest = true
	await expect(edit()).rejects.toThrow('Network failed')
	expect(files).toHaveLength(1)
	rejectRequest = false
	await edit()
	expect(requests).toHaveLength(1)
	expect(files).toHaveLength(0)
})
test('rejects more than ten total attachments before uploading', async () => {
	originalAttachments = Array.from({ length: 10 }, (_, i) => ({
		id: String(i),
		filename: 'old.png',
	}))
	const upload = file()
	files = [upload]
	await expect(edit()).rejects.toThrow('at most 10')
	expect(upload.uploadedFilename).toBe('')
	expect(files).toHaveLength(1)
})
test('duplicate save does not upload or patch twice', async () => {
	files = [file()]
	const saving = edit()
	await actions.editMessage('123', '456', { content: 'duplicate' })
	await saving
	expect(requests).toHaveLength(1)
})
test('saving only attachments still submits an edit when text is unchanged', async () => {
	files = [file()]
	input.handleSaveEditing('original')
	await inFlight
	expect(requests).toHaveLength(1)
	expect(requests[0].body.content).toBe('original')
	expect(requests[0].body.attachments).toHaveLength(2)
	expect(nativeSaves).toBe(1)
})
test('cancelling never uploads queued files', () => {
	const upload = file()
	files = [upload]
	input.handleCancelEditing()
	expect(cancellations).toBe(1)
	expect(upload.uploadedFilename).toBe('')
	expect(requests).toHaveLength(0)
})
test('failed edit restores its files without replacing newly queued files', async () => {
	const upload = file(true)
	files = [upload]
	const saving = edit()
	expect(files).toHaveLength(0)
	const later = file()
	later.id = 'later'
	files.push(later)
	await expect(saving).rejects.toThrow('Could not upload')
	expect(files).toEqual([later, upload])
})
test('unload prevents the pending edit from being sent', async () => {
	files = [file()]
	const saving = edit()
	for (const cleanup of cleanups.slice().reverse()) cleanup()
	await expect(saving).rejects.toThrow('disabled')
	expect(requests).toHaveLength(0)
	expect(files).toHaveLength(1)
})
