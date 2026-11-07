import { ToastActionCreators } from '@valenced/discord/actions'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { attachGif, getChannelId } from './attachments'
import { defaultSettings } from './config'
import { patchPickerMenu } from './picker-menu'
import SettingsComponent from './settings'
import type { Settings } from './config'

type ChatInput = {
	handleSelectGIF(gif: unknown): unknown
	dismissKeyboard(): unknown
	getText(): unknown
	insertText(
		text: string,
		start: number,
		appendSpace: boolean,
		nodes: undefined,
		end: number,
	): unknown
}

function isChatInput(value: unknown): value is ChatInput {
	return (
		typeof value === 'object' &&
		value !== null &&
		'handleSelectGIF' in value &&
		typeof value.handleSelectGIF === 'function' &&
		'dismissKeyboard' in value &&
		typeof value.dismissKeyboard === 'function' &&
		'getText' in value &&
		typeof value.getText === 'function' &&
		'insertText' in value &&
		typeof value.insertText === 'function'
	)
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: defaultSettings },
	start({ cleanup, plugin, jsonStorage }) {
		const downloads = new Set<AbortController>()
		let selectGif: ((gif: unknown, attach: boolean) => unknown) | undefined
		patchPickerMenu(
			cleanup,
			() => jsonStorage.cache,
			(gif, attach) => {
				if (!selectGif) {
					plugin.reportError(new Error('Open a chat before selecting a GIF.'))
					return
				}
				return selectGif(gif, attach)
			},
		)
		cleanup(() => {
			for (const controller of downloads) controller.abort()
			downloads.clear()
			selectGif = undefined
		})
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
								!('chatInput' in refs) ||
								typeof refs.chatInput !== 'object' ||
								refs.chatInput === null ||
								!('current' in refs.chatInput)
							)
								return refs
							const chatInput = refs.chatInput
							const input = chatInput.current
							if (!isChatInput(input)) return refs
							const handleGif = (gif: unknown, attach: boolean) => {
								if (chatInput.current !== input) {
									plugin.reportError(
										new Error('Open a chat before selecting a GIF.'),
									)
									return
								}
								if (
									typeof gif !== 'object' ||
									gif === null ||
									!('url' in gif) ||
									typeof gif.url !== 'string' ||
									!/^https?:\/\/\S+$/i.test(gif.url)
								) {
									plugin.reportError(new Error('This GIF has no usable URL.'))
									return
								}
								// Match Discord's selection handler: close the entire media picker.
								input.dismissKeyboard()
								if (attach) {
									const channelId = getChannelId(refs)
									if (!channelId) {
										plugin.reportError(
											new Error('Could not find the draft channel.'),
										)
										return
									}
									const controller = new AbortController()
									downloads.add(controller)
									const timeout = setTimeout(() => controller.abort(), 30_000)
									void attachGif({
										gif: {
											url: gif.url,
											gifSrc: 'gifSrc' in gif ? gif.gifSrc : undefined,
											src: 'src' in gif ? gif.src : undefined,
										},
										channelId,
										signal: controller.signal,
										isCurrent: () =>
											chatInput.current === input &&
											getChannelId(refs) === channelId,
									})
										.catch(error => {
											if (!downloads.has(controller)) return
											plugin.reportError(error)
											ToastActionCreators.open('GIF_TEXT_ATTACHMENT_ERROR', {
												text: controller.signal.aborted
													? 'GIF download timed out. Try again.'
													: error instanceof Error
														? error.message
														: 'Could not attach the GIF.',
												variant: 'critical',
											})
										})
										.finally(() => {
											clearTimeout(timeout)
											downloads.delete(controller)
										})
									return
								}
								const text = input.getText()
								if (typeof text !== 'string') {
									plugin.reportError(
										new Error('Could not read the message draft.'),
									)
									return
								}
								const separator = text && !/\s$/.test(text) ? '\n' : ''
								return input.insertText(
									separator + gif.url,
									text.length,
									true,
									undefined,
									text.length,
								)
							}
							selectGif = handleGif
							if (patched.has(input)) return refs
							patched.add(input)
							cleanup(
								instead(input, 'handleSelectGIF', ([gif]) =>
									handleGif(gif, jsonStorage.cache?.attachGif === true),
								),
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
	SettingsComponent,
})
