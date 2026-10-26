import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { FileModule } from '@valenced/discord/native'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { useEffect, useRef, useState } from 'react'
import {
	Image,
	KeyboardAvoidingView,
	Modal,
	ScrollView,
	View,
} from 'react-native'
import canvasHtml from './canvas-document.generated'
import { readEditorMedia } from './media-file'
import { getEditorEmojis } from './native-bridge'
import { Timeline } from './timeline'
import { fixWebmDuration } from './webm-duration'
import type { ComponentType, Ref } from 'react'
import type { CanvasCommand } from './canvas-runtime'

export type WebHandle = { injectJavaScript(script: string): void }
export type EditorWebView = ComponentType<{
	ref?: Ref<WebHandle>
	source: { html: string }
	style: { flex: number; backgroundColor: string }
	containerStyle: { flex: number }
	javaScriptEnabled: boolean
	mediaPlaybackRequiresUserAction: boolean
	allowsInlineMediaPlayback: boolean
	originWhitelist: string[]
	onMessage(event: { nativeEvent: { data: string } }): void
	onError(): void
	onContentProcessDidTerminate(): void
}>
export type EmojiPicker = {
	openEmojiPickerActionSheet(
		props: {
			onPressEmoji(emoji: unknown): void
			pickerIntention: number
			autoFocus: boolean
			bypassPremiumEmojiEntitlement: boolean
		},
		stack?: string,
	): void
}
export type OverlayProps = {
	item: { uri: string; mimeType?: string }
	kind: 'image' | 'video'
	WebView: EditorWebView
	emojiPicker?: EmojiPicker
	onEdit(item: unknown): void
	reportError(error: unknown): void
	isCurrent(): boolean
}
// Text, paint, and emoji editing are temporarily disabled.
const OVERLAYS_ENABLED: boolean = false
const key = 'wolfie.media-utils.overlay'
const { SafeAreaProvider, SafeAreaView } = ReactNativeSafeAreaContext
let dismissEditor: (() => void) | undefined
const colors = [
	'#ffffff',
	'#000000',
	'#ed4245',
	'#fee75c',
	'#57f287',
	'#5865f2',
	'#eb459e',
]

function OverlaySheet({
	item,
	kind,
	WebView,
	onEdit,
	reportError,
	isCurrent,
}: OverlayProps) {
	const web = useRef<WebHandle>(null)
	const active = useRef(true)
	const saving = useRef(false)
	const [visible, setVisible] = useState(true)
	const [ready, setReady] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [progress, setProgress] = useState(0)
	const [frames, setFrames] = useState<string[]>([])
	const [position, setPosition] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [duration, setDuration] = useState(0)
	const [start, setStart] = useState(0)
	const [end, setEnd] = useState(0)
	const [muted, setMuted] = useState(false)
	const [tool, setTool] = useState<
		'Trim' | 'Crop' | 'Text' | 'Paint' | 'Emoji'
	>('Trim')
	const draw = tool === 'Paint'
	const [color, setColor] = useState('#ffffff')
	const [size, setSize] = useState(24)
	const [text, setText] = useState('')
	const [emojiQuery, setEmojiQuery] = useState('')
	const [emojis] = useState(() => (OVERLAYS_ENABLED ? getEditorEmojis() : []))
	const html = useRef({ html: canvasHtml }).current
	function send(command: CanvasCommand) {
		web.current?.injectJavaScript(
			`window.mediaCommand(${JSON.stringify(command)});true;`,
		)
	}
	function failed(error: unknown) {
		if (!active.current) return
		saving.current = false
		setBusy(false)
		setError(error instanceof Error ? error.message : String(error))
		reportError(error)
	}
	useEffect(() => {
		const dismiss = () => {
			active.current = false
			send({ type: 'cancel' })
			setVisible(false)
		}
		dismissEditor = dismiss
		return () => {
			active.current = false
			send({ type: 'cancel' })
			if (dismissEditor === dismiss) dismissEditor = undefined
		}
	}, [])
	useEffect(() => {
		if (ready && tool !== 'Crop') send({ type: 'tool', draw, color, size })
	}, [draw, color, size, ready, tool])
	useEffect(() => {
		if (ready && kind === 'video') send({ type: 'trim', start, end, muted })
	}, [start, end, muted, ready])
	async function emoji(value: unknown) {
		if (typeof value !== 'object' || value === null) return
		setTool('Text')
		if (
			'id' in value &&
			typeof value.id === 'string' &&
			/^\d+$/.test(value.id)
		) {
			try {
				const data = await FileModule.readAsset(
					`https://cdn.discordapp.com/emojis/${value.id}.png?size=256`,
					'base64',
				)
				if (active.current)
					send({ type: 'emoji', data: `data:image/png;base64,${data}` })
			} catch (error) {
				failed(error)
			}
		} else if ('surrogates' in value && typeof value.surrogates === 'string')
			send({ type: 'text', text: value.surrogates, color, size: 64 })
	}
	async function message(raw: string) {
		if (!active.current || !isCurrent()) return
		try {
			const message: unknown = JSON.parse(raw)
			if (
				typeof message !== 'object' ||
				message === null ||
				!('type' in message)
			)
				return
			if (message.type === 'boot') {
				const data = await readEditorMedia(item.uri)
				if (!active.current || !isCurrent()) return
				if (data.length > (64 * 1024 * 1024 * 4) / 3)
					throw new Error(
						'This editor currently supports source files up to 64 MB.',
					)
				send({
					type: 'load',
					data,
					kind,
					mime: item.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/png'),
				})
			} else if (
				message.type === 'thumbnails' &&
				'frames' in message &&
				Array.isArray(message.frames)
			) {
				setFrames(
					message.frames
						.filter(
							(value): value is string =>
								typeof value === 'string' &&
								value.startsWith('data:image/jpeg;base64,'),
						)
						.slice(0, 8),
				)
			} else if (
				message.type === 'playhead' &&
				'time' in message &&
				typeof message.time === 'number'
			) {
				setPosition(message.time)
				setPlaying('playing' in message && message.playing === true)
			} else if (message.type === 'ready') {
				if (
					kind === 'video' &&
					(!('videoSupported' in message) || !message.videoSupported)
				)
					throw new Error(
						'Update Android System WebView to enable video export.',
					)
				if (
					'duration' in message &&
					typeof message.duration === 'number' &&
					Number.isFinite(message.duration)
				) {
					setDuration(message.duration)
					setEnd(message.duration)
				}
				setReady(true)
				send({ type: 'thumbnails' })
			} else if (
				message.type === 'progress' &&
				'value' in message &&
				typeof message.value === 'number'
			)
				setProgress(message.value)
			else if (message.type === 'error' && 'message' in message)
				throw new Error(String(message.message))
			else if (message.type === 'result' && saving.current) {
				if (
					!('data' in message) ||
					typeof message.data !== 'string' ||
					message.data.length > 90_000_000 ||
					!/^[A-Za-z0-9+/]*={0,2}$/.test(message.data) ||
					!('mime' in message) ||
					!['image/png', 'video/mp4', 'video/webm'].includes(
						String(message.mime),
					) ||
					!('width' in message) ||
					typeof message.width !== 'number' ||
					!('height' in message) ||
					typeof message.height !== 'number'
				)
					throw new Error('Invalid media export.')
				const mime = String(message.mime)
				if ((kind === 'image') !== (mime === 'image/png'))
					throw new Error('Unexpected export format.')
				const extension =
					mime === 'image/png' ? 'png' : mime === 'video/mp4' ? 'mp4' : 'webm'
				const filename = `media-utils-${Date.now()}.${extension}`
				const path = `media-utils/${filename}`
				let data = message.data
				if (mime === 'video/webm') {
					if (!('duration' in message) || typeof message.duration !== 'number')
						throw new Error('Missing video duration.')
					const bytes = fixWebmDuration(
						Uint8Array.from(atob(data), c => c.charCodeAt(0)),
						message.duration,
					)
					const chunks: string[] = []
					for (let i = 0; i < bytes.length; i += 8190)
						chunks.push(
							btoa(String.fromCharCode(...bytes.subarray(i, i + 8190))),
						)
					data = chunks.join('')
				}
				const file = await FileModule.writeFile('cache', path, data, 'base64')
				if (!active.current || !isCurrent()) {
					await FileModule.removeFile('cache', path)
					return
				}
				const uri = file.startsWith('file://') ? file : `file://${file}`
				try {
					onEdit({
						id: filename,
						uri,
						originalUri: uri,
						filename,
						mimeType: mime,
						width: message.width,
						height: message.height,
						platform: 0,
						origin: 1,
					})
				} catch (error) {
					await FileModule.removeFile('cache', path)
					throw error
				}
				saving.current = false
				closeOverlayEditor()
			}
		} catch (error) {
			failed(error)
		}
	}
	function close() {
		active.current = false
		setVisible(false)
		closeOverlayEditor()
	}
	function choose(next: typeof tool) {
		if (busy || (!OVERLAYS_ENABLED && next !== 'Trim' && next !== 'Crop'))
			return
		setTool(next)
		if (next === 'Crop') send({ type: 'crop' })
		else send({ type: 'tool', draw: next === 'Paint', color, size })
	}
	function save() {
		if (!ready || saving.current) return
		saving.current = true
		setBusy(true)
		setError('')
		send({ type: 'export' })
	}
	return (
		<Design.ActionSheet>
			<View style={{ height: 1 }}>
				<Modal visible={visible} animationType="slide" onRequestClose={close}>
					<SafeAreaProvider>
						<SafeAreaView
							edges={['top', 'bottom', 'left', 'right']}
							style={{ flex: 1, backgroundColor: '#111214' }}
						>
							<KeyboardAvoidingView
								behavior="height"
								style={{ flex: 1, backgroundColor: '#111214' }}
							>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										justifyContent: 'space-between',
										padding: 12,
									}}
								>
									<Design.Button
										text="Cancel"
										variant="tertiary"
										size="sm"
										onPress={close}
									/>
									<Design.Text
										style={{
											color: '#ffffff',
											fontSize: 18,
											fontWeight: '600',
										}}
									>
										Edit video
									</Design.Text>
									<Design.Button
										text={busy ? `${Math.round(progress * 100)}%` : 'Save'}
										size="sm"
										disabled={!ready || busy}
										onPress={save}
									/>
								</View>
								<View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
									<WebView
										ref={web}
										source={html}
										style={{ flex: 1, backgroundColor: '#111214' }}
										containerStyle={{ flex: 1 }}
										javaScriptEnabled
										mediaPlaybackRequiresUserAction={false}
										allowsInlineMediaPlayback
										originWhitelist={['about:blank']}
										onMessage={event => void message(event.nativeEvent.data)}
										onError={() =>
											failed(new Error('The media canvas failed to load.'))
										}
										onContentProcessDidTerminate={() =>
											failed(
												new Error(
													'Android closed the editor. Reopen it to continue.',
												),
											)
										}
									/>
								</View>
								<View
									style={{
										flexShrink: 0,
										backgroundColor: '#111214',
										padding: 12,
										gap: 12,
									}}
								>
									{error ? (
										<Design.Text style={{ color: '#ff858b' }}>
											{error}
										</Design.Text>
									) : null}
									{!ready && !error ? (
										<Design.Text style={{ color: '#ffffff' }}>
											Loading video…
										</Design.Text>
									) : null}
									{busy ? (
										<Design.Text style={{ color: '#ffffff' }}>
											Saving video… Keep this screen open.
										</Design.Text>
									) : (
										ready && (
											<>
												<View
													style={{
														flexDirection: 'row',
														justifyContent: 'space-between',
														alignItems: 'center',
													}}
												>
													<Design.Button
														text={playing ? 'Pause' : 'Play'}
														variant="secondary"
														size="sm"
														onPress={() => send({ type: 'preview' })}
													/>
													<Design.Text style={{ color: '#ffffff' }}>
														{position.toFixed(1)} / {end.toFixed(1)}s
													</Design.Text>
													<Design.Button
														text="Undo"
														variant="tertiary"
														size="sm"
														onPress={() => send({ type: 'undo' })}
													/>
												</View>
												<Timeline
													duration={duration}
													start={start}
													end={end}
													position={position}
													frames={frames}
													onTrim={(from, to) => {
														setStart(from)
														setEnd(to)
													}}
													onSeek={time => send({ type: 'seek', time })}
												/>
												<Design.Button
													text={muted ? 'Sound off' : 'Sound on'}
													variant="tertiary"
													size="sm"
													onPress={() => setMuted(!muted)}
												/>
												{tool !== 'Trim' && (
													<View style={{ height: 146 }}>
														<ScrollView
															keyboardShouldPersistTaps="handled"
															contentContainerStyle={{ gap: 10 }}
														>
															{tool === 'Crop' && (
																<>
																	<Design.Text style={{ color: '#ffffff' }}>
																		Drag across the preview to crop.
																	</Design.Text>
																	<View
																		style={{
																			flexDirection: 'row',
																			gap: 8,
																			flexWrap: 'wrap',
																		}}
																	>
																		{[
																			{ label: 'Free', ratio: 0 },
																			{ label: '1:1', ratio: 1 },
																			{ label: '4:5', ratio: 4 / 5 },
																			{ label: '9:16', ratio: 9 / 16 },
																			{ label: '16:9', ratio: 16 / 9 },
																		].map(({ label, ratio }) => (
																			<Design.Button
																				key={label}
																				text={label}
																				variant="secondary"
																				size="sm"
																				onPress={() =>
																					send({ type: 'crop', ratio })
																				}
																			/>
																		))}
																	</View>
																	<View
																		style={{ flexDirection: 'row', gap: 8 }}
																	>
																		<Design.Button
																			text="Rotate 90°"
																			variant="secondary"
																			size="sm"
																			onPress={() => {
																				send({ type: 'rotate' })
																				send({ type: 'crop' })
																			}}
																		/>
																		<Design.Button
																			text="Reset crop"
																			variant="tertiary"
																			size="sm"
																			onPress={() => {
																				send({ type: 'reset-crop' })
																				send({ type: 'crop' })
																			}}
																		/>
																	</View>
																</>
															)}
															{tool === 'Emoji' && (
																<>
																	<Design.TextInput
																		value={emojiQuery}
																		onChange={setEmojiQuery}
																		placeholder="Search server emojis"
																	/>
																	<View
																		style={{
																			flexDirection: 'row',
																			flexWrap: 'wrap',
																			gap: 8,
																		}}
																	>
																		{emojis
																			.filter(value =>
																				value.name
																					.toLowerCase()
																					.includes(emojiQuery.toLowerCase()),
																			)
																			.slice(0, 60)
																			.map(value => (
																				<Design.Button
																					key={value.id}
																					text={value.name}
																					variant="secondary"
																					size="sm"
																					renderIcon={() => (
																						<Image
																							source={{
																								uri: `https://cdn.discordapp.com/emojis/${value.id}.png?size=64`,
																							}}
																							style={{ width: 24, height: 24 }}
																						/>
																					)}
																					onPress={() => void emoji(value)}
																				/>
																			))}
																	</View>
																	{emojis.length === 0 && (
																		<Design.Text style={{ color: '#b5bac1' }}>
																			No server emojis loaded. Use Text to add a
																			keyboard emoji.
																		</Design.Text>
																	)}
																</>
															)}
															{tool === 'Text' && (
																<View
																	style={{
																		flexDirection: 'row',
																		alignItems: 'center',
																		gap: 8,
																	}}
																>
																	<View style={{ flex: 1 }}>
																		<Design.TextInput
																			value={text}
																			onChange={setText}
																			placeholder="Add text"
																		/>
																	</View>
																	<Design.Button
																		text="Add"
																		size="sm"
																		onPress={() => {
																			if (text.trim()) {
																				send({
																					type: 'text',
																					text: text.trim(),
																					color,
																					size,
																				})
																				setText('')
																			}
																		}}
																	/>
																</View>
															)}
															{(tool === 'Text' || tool === 'Paint') && (
																<>
																	<ScrollView
																		horizontal
																		showsHorizontalScrollIndicator={false}
																		contentContainerStyle={{ gap: 8 }}
																	>
																		{colors.map(value => (
																			<Design.Button
																				key={value}
																				accessibilityLabel={`Color ${value}`}
																				text={value === color ? '●' : '○'}
																				variant="secondary"
																				size="sm"
																				textStyle={{ color: value }}
																				onPress={() => setColor(value)}
																			/>
																		))}
																	</ScrollView>
																	<Design.Slider
																		minimumValue={4}
																		maximumValue={100}
																		step={1}
																		value={size}
																		onValueChange={setSize}
																	/>
																	<Design.Text style={{ color: '#b5bac1' }}>
																		{tool === 'Paint'
																			? 'Draw on the preview with your finger.'
																			: 'Drag text or emoji to move it.'}
																	</Design.Text>
																</>
															)}
														</ScrollView>
													</View>
												)}
												<View
													style={{
														flexDirection: 'row',
														justifyContent: 'space-between',
														gap: 4,
													}}
												>
													{(
														(OVERLAYS_ENABLED
															? ['Trim', 'Crop', 'Text', 'Paint', 'Emoji']
															: ['Trim', 'Crop']) as readonly (typeof tool)[]
													).map(value => (
														<Design.Button
															key={value}
															text={value}
															variant={tool === value ? 'primary' : 'secondary'}
															size="sm"
															style={{
																flex: 1,
																minWidth: 0,
																paddingHorizontal: 0,
															}}
															textStyle={{ fontSize: 12 }}
															onPress={() => choose(value)}
														/>
													))}
												</View>
											</>
										)
									)}
								</View>
							</KeyboardAvoidingView>
						</SafeAreaView>
					</SafeAreaProvider>
				</Modal>
			</View>
		</Design.ActionSheet>
	)
}

export function openOverlayEditor(props: OverlayProps) {
	ActionSheetActionCreators.hideActionSheet('UploadPreviewActionSheet')
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: OverlaySheet }),
		key,
		props,
	)
}
export function closeOverlayEditor() {
	dismissEditor?.()
	ActionSheetActionCreators.hideActionSheet(key)
}

function EditorError({ message }: { message: string }) {
	return (
		<Design.ActionSheet
			header={<Design.BottomSheetTitleHeader title="Could not open editor" />}
		>
			<Design.TableRow label="MediaUtils" subLabel={message} />
			<Design.ActionSheetRow label="Close" onPress={closeOverlayEditor} />
		</Design.ActionSheet>
	)
}
export function openEditorError(error: unknown) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: EditorError }),
		key,
		{ message: error instanceof Error ? error.message : String(error) },
		'stack',
	)
}
