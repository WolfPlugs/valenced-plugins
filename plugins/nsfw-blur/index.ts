import { getStore } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'
import { instead } from '@valenced/patcher'
import {
	blurEmbeds,
	isNsfwChannel,
	isVisualAttachment,
	withBlur,
} from './media'
import SettingsComponent from './settings'
import type { Channel } from './media'

export type Settings = { allChannels: boolean; strength: number }
export const DefaultSettings: Settings = { allChannels: false, strength: 24 }

type ChannelStore = { getChannel(id: string): Channel | undefined }
type RowModule = { generateMessageRowData(...args: unknown[]): unknown }
type ObscurityModule = {
	getAttachmentObscurityProps(...args: unknown[]): unknown
	getUnfurledMediaItemObscurityProps(...args: unknown[]): unknown
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin }) {
		const configure = callNativeMethod as (
			name: string,
			args: unknown[],
		) => Promise<unknown>
		const syncStrength = () => {
			configure('wolfie.nsfw-blur.configure', [
				jsonStorage.cache?.strength ?? 24,
			]).catch(error => plugin.reportError(error))
		}
		syncStrength()
		cleanup(jsonStorage.subscribe(syncStrength))
		let channels: ChannelStore | undefined
		let blur = false
		cleanup(
			getStore<ChannelStore>('ChannelStore', store => {
				channels = store
			}),
		)
		cleanup(
			getModules(
				withProps<RowModule>('generateMessageRowData'),
				module => {
					cleanup(
						instead(
							module,
							'generateMessageRowData',
							function (args, original) {
								const previous = blur
								blur = false
								const row = args[0]
								if (
									typeof row === 'object' &&
									row !== null &&
									'message' in row
								) {
									const message = row.message
									if (
										typeof message === 'object' &&
										message !== null &&
										'channel_id' in message &&
										typeof message.channel_id === 'string'
									) {
										const store = channels
										blur =
											jsonStorage.cache?.allChannels === true ||
											(store !== undefined &&
												isNsfwChannel(
													store.getChannel(message.channel_id),
													id => store.getChannel(id),
												))
									}
								}
								try {
									return Reflect.apply(original, this, args)
								} finally {
									blur = previous
								}
							},
						),
					)
				},
				{ max: Infinity },
			),
		)
		cleanup(
			getModules(
				withName<(...args: unknown[]) => unknown>('createMessageContent'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return
					cleanup(
						instead(module, 'default', function (args, original) {
							const result = Reflect.apply(original, this, args)
							if (
								blur &&
								typeof result === 'object' &&
								result !== null &&
								'obscureLearnMoreLabel' in result
							)
								return { ...result, obscureLearnMoreLabel: null }
							return result
						}),
					)
				},
				{ returnNamespace: true, max: Infinity },
			),
		)

		cleanup(
			getModules(
				withName<(...args: unknown[]) => unknown>('transformEmbeds'),
				module => {
					if (!('default' in module) || typeof module.default !== 'function')
						return
					cleanup(
						instead(module, 'default', function (args, original) {
							const result = Reflect.apply(original, this, args)
							return blur ? blurEmbeds(result) : result
						}),
					)
				},
				{ returnNamespace: true, max: Infinity },
			),
		)

		cleanup(
			getModules(
				withProps<ObscurityModule>(
					'getAttachmentObscurityProps',
					'getUnfurledMediaItemObscurityProps',
				),
				module => {
					for (const method of [
						'getAttachmentObscurityProps',
						'getUnfurledMediaItemObscurityProps',
					] as const) {
						cleanup(
							instead(module, method, function (args, original) {
								const result = Reflect.apply(original, this, args)
								if (!blur) return result
								const options = args[0]
								if (typeof options !== 'object' || options === null)
									return result
								const embedded = method === 'getUnfurledMediaItemObscurityProps'
								const visual = embedded
									? 'type' in options &&
										(options.type === 'image' || options.type === 'video')
									: 'attachment' in options &&
										isVisualAttachment(options.attachment)
								return visual ? withBlur(result, embedded) : result
							}),
						)
					}
				},
				{ max: Infinity },
			),
		)
	},
	SettingsComponent,
})
