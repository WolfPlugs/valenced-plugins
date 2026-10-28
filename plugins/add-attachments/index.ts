import { ToastActionCreators } from '@valenced/discord/actions'
import { Constants } from '@valenced/discord/common/constants'
import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { uploadAttachment } from './upload'
import type { DiscordModules } from '@valenced/discord/types'
import type { Upload } from './upload'

function isEditInput(
	value: unknown,
): value is { handleSaveEditing(...args: unknown[]): unknown } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'handleSaveEditing' in value &&
		typeof value.handleSaveEditing === 'function'
	)
}
function getChannelId(refs: unknown): string | undefined {
	if (typeof refs !== 'object' || refs === null || !('props' in refs)) return
	const props = refs.props
	if (typeof props !== 'object' || props === null || !('current' in props))
		return
	const current = props.current
	if (
		typeof current !== 'object' ||
		current === null ||
		!('channel' in current)
	)
		return
	const channel = current.channel
	if (typeof channel !== 'object' || channel === null || !('id' in channel))
		return
	return typeof channel.id === 'string' ? channel.id : undefined
}

type EditActions = {
	editMessage(channelId: string, messageId: string, edit: unknown): unknown
	startEditMessage: unknown
}
type Request = { url: string; body?: Record<string, unknown> }
type Response = { hasErr: boolean; status: number; body?: unknown }
type HTTP = {
	patch(request: Request, callback: (response: Response) => void): void
}

export default plugin({
	start({ cleanup, plugin }) {
		const pending = new Map<string, { channelId: string; files: Upload[] }>()
		const uploadsFor = (channelId: string) =>
			(
				Stores.UploadAttachmentStore as DiscordModules.Flux.Store<{
					getUploads(channelId: string, draftType: number): Upload[]
				}>
			)?.getUploads(channelId, 0) ?? []
		const setUploads = (channelId: string, uploads: Upload[]) =>
			Dispatcher.dispatch({
				type: 'UPLOAD_ATTACHMENT_SET_UPLOADS',
				channelId,
				draftType: 0,
				uploads,
			})
		const restore = (url: string) => {
			const edit = pending.get(url)
			if (!edit) return
			pending.delete(url)
			const current = uploadsFor(edit.channelId)
			setUploads(edit.channelId, [
				...current,
				...edit.files.filter(
					file => !current.some(queued => queued.id === file.id),
				),
			])
		}
		let stopped = false
		cleanup(() => {
			stopped = true
			for (const url of pending.keys()) restore(url)
		})
		const report = (error: unknown) => {
			plugin.reportError(error)
			ToastActionCreators.open('ADD_ATTACHMENTS_ERROR', {
				text:
					error instanceof Error ? error.message : 'Could not add attachments.',
				variant: 'critical',
			})
		}
		cleanup(
			getModules(
				withProps<{ HTTP: HTTP }>('HTTP'),
				({ HTTP: http }) => {
					cleanup(
						instead(http, 'patch', async function (args, original) {
							const [request, callback] = args
							const edit = pending.get(request.url)
							if (!edit) return Reflect.apply(original, this, args)
							let failedResponse: Response | undefined
							try {
								const messages =
									Stores.MessageStore as DiscordModules.Flux.Store<{
										getMessage(
											channelId: string,
											messageId: string,
										):
											| { attachments: { id: string; filename: string }[] }
											| undefined
									}>
								const messageId = request.url.split('/').pop()
								const message =
									messageId && messages?.getMessage(edit.channelId, messageId)
								if (!message)
									throw new Error('Could not find the message being edited.')
								const existing =
									request.body?.attachments ?? message.attachments
								if (!Array.isArray(existing))
									throw new Error('Unsupported attachment list.')
								if (existing.length + edit.files.length > 10)
									throw new Error('A message can have at most 10 attachments.')
								const attachments: Awaited<
									ReturnType<typeof uploadAttachment>
								>[] = []
								for (const file of edit.files) {
									if (stopped) throw new Error('AddAttachments was disabled.')
									attachments.push(
										await uploadAttachment(file, attachments.length),
									)
								}
								if (stopped) throw new Error('AddAttachments was disabled.')
								const result = await new Promise<Response>(
									(resolve, reject) => {
										Reflect.apply(original, this, [
											{
												...request,
												body: {
													...request.body,
													attachments: [...existing, ...attachments],
												},
											},
											(response: Response) => {
												if (
													response.hasErr ||
													response.status < 200 ||
													response.status >= 300
												) {
													failedResponse = response
													reject(
														new Error(
															`Discord rejected the attachment edit (HTTP ${response.status}).`,
														),
													)
												} else resolve(response)
											},
										])
									},
								)
								pending.delete(request.url)
								callback(result)
								return result
							} catch (error) {
								restore(request.url)
								report(error)
								callback(
									failedResponse ?? {
										hasErr: true,
										status: 0,
										body: {
											message:
												error instanceof Error
													? error.message
													: 'Attachment edit failed.',
										},
									},
								)
							} finally {
								pending.delete(request.url)
							}
						}),
					)
				},
				{ max: 1 },
			),
		)
		cleanup(
			getModules(
				withProps<EditActions>('editMessage', 'startEditMessage'),
				actions => {
					cleanup(
						instead(actions, 'editMessage', function (args, original) {
							const [channelId, messageId] = args
							const endpoints = Constants?.Endpoints
							if (
								typeof endpoints !== 'object' ||
								endpoints === null ||
								typeof endpoints.MESSAGE !== 'function'
							)
								return Reflect.apply(original, this, args)
							const url: string = endpoints.MESSAGE(channelId, messageId)
							if (pending.has(url)) return
							const uploads =
								Stores.UploadAttachmentStore as DiscordModules.Flux.Store<{
									getUploads(channelId: string, draftType: number): Upload[]
								}>
							const files = uploads?.getUploads(channelId, 0).slice() ?? []
							if (files.length) pending.set(url, { channelId, files })
							try {
								if (files.length)
									setUploads(
										channelId,
										uploadsFor(channelId).filter(file => !files.includes(file)),
									)
								return Promise.resolve(
									Reflect.apply(original, this, args),
								).catch(error => {
									restore(url)
									throw error
								})
							} catch (error) {
								restore(url)
								throw error
							}
						}),
					)
				},
				{ max: 1 },
			),
		)
		const patched = new WeakSet<object>()
		cleanup(
			getModules(
				withName<(...args: unknown[]) => unknown>('useChatInputRefs'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return
					cleanup(
						after(module, 'default', refs => {
							if (
								typeof refs !== 'object' ||
								refs === null ||
								!('chatInput' in refs)
							)
								return refs
							const ref = refs.chatInput
							if (
								typeof ref !== 'object' ||
								ref === null ||
								!('current' in ref)
							)
								return refs
							const input = ref.current
							if (!isEditInput(input) || patched.has(input)) return refs
							patched.add(input)
							cleanup(
								instead(input, 'handleSaveEditing', function (args, original) {
									const channelId = getChannelId(refs)
									const edits =
										Stores.EditMessageStore as DiscordModules.Flux.Store<{
											getEditingMessage(
												channelId: string,
											): { id: string; content: string } | undefined
											getEditingTextValue(channelId: string): string
										}>
									const uploads =
										Stores.UploadAttachmentStore as DiscordModules.Flux.Store<{
											getUploads(channelId: string, draftType: number): Upload[]
										}>
									const message =
										channelId && edits?.getEditingMessage(channelId)
									if (
										channelId &&
										message &&
										uploads?.getUploads(channelId, 0).length &&
										(args[0] === edits?.getEditingTextValue(channelId) ||
											args[0] === message.content)
									) {
										const [actions] = lookupModule(
											withProps<EditActions>('editMessage', 'startEditMessage'),
										)
										if (actions)
											void Promise.resolve(
												actions.editMessage(channelId, message.id, {
													content: message.content,
												}),
											).catch(report)
									}
									return Reflect.apply(original, this, args)
								}),
							)
							return refs
						}),
					)
				},
				{ returnNamespace: true, max: 1 },
			),
		)
		if (plugin.startedLate) plugin.requireReload()
	},
})
