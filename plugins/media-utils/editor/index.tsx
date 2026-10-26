import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { Children, cloneElement, isValidElement } from 'react'
import { prepareNativeEditor } from './native-bridge'
import {
	closeOverlayEditor,
	openEditorError,
	openOverlayEditor,
} from './overlay-sheet'
import { resolveWebView } from './webview'
import type { ReactNode } from 'react'
import type { EditorWebView, EmojiPicker } from './overlay-sheet'

export function patchImageEditor(
	cleanup: (callback: () => void) => void,
	reportError: (error: unknown) => void,
) {
	let WebView: EditorWebView | undefined
	let emojiPicker: EmojiPicker | undefined
	let disposed = false
	cleanup(() => {
		disposed = true
		closeOverlayEditor()
	})
	cleanup(
		getModules(
			withProps<EditorWebView & { isFileUploadSupported: unknown }>(
				'isFileUploadSupported',
			),
			module => {
				WebView = module
			},
			{ max: 1 },
		),
	)
	cleanup(
		getModules(
			withProps<EmojiPicker>('openEmojiPickerActionSheet'),
			module => {
				emojiPicker = module
			},
			{ max: 1 },
		),
	)
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('UploadPreviewActionSheet'),
			module => {
				if (!('default' in module) || typeof module.default !== 'function')
					return
				cleanup(
					instead(module, 'default', function (args, original) {
						const result = Reflect.apply(original, this, args)
						const props = args[0]
						if (
							typeof props !== 'object' ||
							props === null ||
							!('onEdit' in props) ||
							typeof props.onEdit !== 'function' ||
							!('upload' in props)
						)
							return result
						const upload = props.upload
						if (
							typeof upload !== 'object' ||
							upload === null ||
							!('item' in upload)
						)
							return result
						if ('isImage' in upload && upload.isImage) {
							function prepare(node: ReactNode): ReactNode {
								if (
									!isValidElement<{
										children?: ReactNode
										label?: unknown
										icon?: ReactNode
										onPress?: () => unknown
									}>(node)
								)
									return node
								const icon = lookupGeneratedIconComponent('PencilSparkleIcon')
								if (
									node.type === Design.TableRow &&
									typeof node.props.onPress === 'function' &&
									((icon &&
										isValidElement(node.props.icon) &&
										node.props.icon.type === icon) ||
										(typeof node.props.label === 'string' &&
											/^edit image$/i.test(node.props.label)))
								) {
									const press = node.props.onPress
									return cloneElement(node, {
										onPress: () => {
											void prepareNativeEditor()
												.catch(reportError)
												.then(() => {
													if (!disposed) press()
												})
										},
									})
								}
								return node.props.children
									? cloneElement(
											node,
											{},
											Children.map(node.props.children, prepare),
										)
									: node
							}
							return isValidElement(result) ? prepare(result) : result
						}
						if (!('isVideo' in upload) || !upload.isVideo) return result
						const item = upload.item
						if (
							typeof item !== 'object' ||
							item === null ||
							!('uri' in item) ||
							typeof item.uri !== 'string'
						)
							return result
						const uri = item.uri
						const onEdit = props.onEdit
						const isVideo = 'isVideo' in upload && Boolean(upload.isVideo)
						const EditIcon = lookupGeneratedIconComponent('PencilSparkleIcon')
						const open = () => {
							try {
								if (disposed) return
								WebView ??= resolveWebView()
								if (!WebView)
									throw new Error(
										'MediaUtils: the React Native WebView dependency fingerprint did not match this Discord build.',
									)
								openOverlayEditor({
									item: {
										uri,
										mimeType:
											'mimeType' in item && typeof item.mimeType === 'string'
												? item.mimeType
												: undefined,
									},
									kind: isVideo ? 'video' : 'image',
									WebView,
									emojiPicker,
									onEdit: edited => {
										if (!disposed) Reflect.apply(onEdit, undefined, [edited])
									},
									reportError,
									isCurrent: () => !disposed,
								})
							} catch (error) {
								openEditorError(error)
								reportError(error)
							}
						}
						let inserted = false
						function insert(node: ReactNode): ReactNode {
							if (!isValidElement<{ children?: ReactNode }>(node)) return node
							if (node.type === Design.TableRowGroup && !inserted) {
								const rows = Children.toArray(node.props.children)
								rows.push(
									<Design.TableRow
										key="media-utils-editor"
										label="Edit video"
										arrow
										icon={EditIcon ? <EditIcon /> : undefined}
										onPress={open}
									/>,
								)
								inserted = true
								return cloneElement(node, {}, ...rows)
							}
							return node.props.children
								? cloneElement(
										node,
										{},
										Children.map(node.props.children, insert),
									)
								: node
						}
						return isValidElement(result) ? insert(result) : result
					}),
				)
			},
			{ returnNamespace: true, max: Infinity },
		),
	)
}
