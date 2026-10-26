import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { getStore } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { after } from '@valenced/patcher'
import { createElement } from 'react'
import { Image } from 'react-native'
import { closeEmbedBuilder, openEmbedBuilder } from './builder'
import { isRecord } from './protocol'
import { hasBotToken } from './session'
import type { PendingUpload } from './uploads'

type Props = { items?: unknown[]; [key: string]: unknown }

function hasRender<K extends string>(
	value: unknown,
	key: K,
): value is Record<K, (props: Props, ...rest: unknown[]) => unknown> {
	return isRecord(value) && typeof value[key] === 'function'
}

export function installEmbedBuilder(
	cleanup: (...callbacks: (() => void)[]) => void,
	reportError: (error: unknown) => void,
) {
	let uploadStore:
		| { getUploads(channelId: string, draftType: number): PendingUpload[] }
		| undefined
	let channelStore: { getChannelId(): string | undefined } | undefined
	cleanup(
		getStore<{ getChannelId(): string | undefined }>(
			'SelectedChannelStore',
			store => {
				channelStore = store
			},
		),
	)
	cleanup(
		getStore<{
			getUploads(channelId: string, draftType: number): PendingUpload[]
		}>('UploadAttachmentStore', store => {
			uploadStore = store
		}),
	)
	cleanup(closeEmbedBuilder)
	cleanup(
		getModuleWithImportedPath<unknown>(
			'modules/chat_input/native/action_buttons/ChatInputActions.tsx',
			exports => {
				if (!isRecord(exports)) return
				function inject(args: [Props, ...unknown[]]): [Props, ...unknown[]] {
					const [props, ...rest] = args
					if (!hasBotToken() || !isRecord(props)) return args
					const buttons = Array.isArray(props.items) ? props.items : []
					if (
						buttons.some(
							button =>
								isRecord(button) && button.key === 'bot-client-embed-builder',
						)
					)
						return args
					return [
						{
							...props,
							items: [
								...buttons,
								{
									key: 'bot-client-embed-builder',
									label: 'Embed Builder',
									disabled: false,
									IconComponent: () =>
										createElement(Image, {
											source: getAssetIdByName('FileIcon'),
											style: { width: 24, height: 24, tintColor: '#f2f3f5' },
										}),
									action: () => {
										const channelId = channelStore?.getChannelId()
										if (!channelId) {
											ToastActionCreators.open('BOT_CLIENT_BUILDER_ERROR', {
												text: 'Open a message channel first.',
												variant: 'critical',
											})
											return
										}
										try {
											openEmbedBuilder({
												channelId,
												currentChannel: () => channelStore?.getChannelId(),
												reportError,
												pendingUploads: () =>
													uploadStore?.getUploads(channelId, 0) ?? [],
												consumeUploads: ids => {
													if (uploadStore)
														Dispatcher.dispatch({
															type: 'UPLOAD_ATTACHMENT_SET_UPLOADS',
															channelId,
															draftType: 0,
															uploads: uploadStore
																.getUploads(channelId, 0)
																.filter(file => !ids.includes(file.id)),
														})
												},
											})
										} catch (error) {
											reportError(error)
										}
									},
								},
							],
						},
						...rest,
					]
				}
				// Match only the plus button's native long-press context menu.
				function injectSheet(value: unknown): unknown {
					if (Array.isArray(value)) return value.map(injectSheet)
					if (!isRecord(value) || !isRecord(value.props)) return value
					const props = value.props
					if (props.triggerOnLongPress === true && Array.isArray(props.items))
						return { ...value, props: inject([props])[0] }
					if (!('children' in props) && !('footer' in props)) return value
					return {
						...value,
						props: {
							...props,
							children: injectSheet(props.children),
							footer: injectSheet(props.footer),
						},
					}
				}
				const patchSheet = (result: unknown) => injectSheet(result)
				if (hasRender(exports, 'default')) {
					cleanup(after(exports, 'default', patchSheet))
				} else if (hasRender(exports.default, 'type')) {
					cleanup(after(exports.default, 'type', patchSheet))
				} else if (
					isRecord(exports.default) &&
					hasRender(exports.default.type, 'render')
				) {
					cleanup(after(exports.default.type, 'render', patchSheet))
				} else if (hasRender(exports.default, 'render')) {
					cleanup(after(exports.default, 'render', patchSheet))
				} else
					reportError(
						new Error(
							'The attachment menu component is not supported by this Discord version.',
						),
					)
			},
		),
	)
}
