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
import { saveEditorResult } from './save-result'
import { CropPanel } from './shared/crop-panel'
import { EditorIconButton } from './shared/editor-icon'
import { useCropControls } from './shared/use-crop-controls'
import { VideoControls } from './video/controls'
import { pickSoundtrack } from './video/soundtrack'
import type { CanvasCommand } from './protocol'
import type { EditorTool, OverlayProps, WebHandle } from './types'
import type { TimelineFrames } from './video/timeline'

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
	const [frames, setFrames] = useState<TimelineFrames | null>(null)
	const thumbnailRequest = useRef(0)
	const [position, setPosition] = useState(0)
	const [playing, setPlaying] = useState(false)
	const [duration, setDuration] = useState(0)
	const [start, setStart] = useState(0)
	const [end, setEnd] = useState(0)
	const [volume, setVolume] = useState(100)
	const [musicVolume, setMusicVolume] = useState(50)
	const [soundtrack, setSoundtrack] = useState<string | null>(null)
	const [loadingAudio, setLoadingAudio] = useState(false)
	const audioRequest = useRef(0)
	const [resetKey, setResetKey] = useState(0)
	const crop = useCropControls(send)
	const [tool, setTool] = useState<EditorTool>('Trim')
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
		if (ready && kind === 'video') send({ type: 'trim', start, end })
	}, [start, end, ready])
	useEffect(() => {
		if (ready)
			send({
				type: 'audio',
				volume: volume / 100,
				musicVolume: musicVolume / 100,
			})
	}, [volume, musicVolume, ready])
	async function addSoundtrack() {
		const request = ++audioRequest.current
		setLoadingAudio(true)
		try {
			const picked = await pickSoundtrack()
			if (!active.current || request !== audioRequest.current) return
			if (!picked) {
				setLoadingAudio(false)
				return
			}
			setSoundtrack(picked.name)
			send({ type: 'soundtrack', data: picked.data, mime: picked.mime })
		} catch (error) {
			if (!active.current || request !== audioRequest.current) return
			setLoadingAudio(false)
			failed(error)
		}
	}
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
			if (message.type === 'soundtrack-error' && 'message' in message) {
				setLoadingAudio(false)
				setSoundtrack(null)
				failed(new Error(String(message.message)))
			} else if (message.type === 'soundtrack-ready') {
				setLoadingAudio(false)
			} else if (message.type === 'boot') {
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
				'id' in message &&
				message.id === thumbnailRequest.current &&
				'from' in message &&
				typeof message.from === 'number' &&
				'span' in message &&
				typeof message.span === 'number' &&
				'frames' in message &&
				Array.isArray(message.frames)
			) {
				setFrames({
					from: message.from,
					span: message.span,
					images: message.frames
						.filter(
							(value): value is string =>
								typeof value === 'string' &&
								value.startsWith('data:image/jpeg;base64,'),
						)
						.slice(0, 16),
				})
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
				if (
					'width' in message &&
					typeof message.width === 'number' &&
					'height' in message &&
					typeof message.height === 'number' &&
					message.width > 0 &&
					message.height > 0
				) {
					crop.initialize(message.width, message.height)
				}
				setReady(true)
			} else if (
				message.type === 'progress' &&
				'value' in message &&
				typeof message.value === 'number'
			)
				setProgress(message.value)
			else if (message.type === 'error' && 'message' in message)
				throw new Error(String(message.message))
			else if (message.type === 'result' && saving.current) {
				await saveEditorResult({
					message,
					kind,
					isCurrent: () => active.current && isCurrent(),
					onEdit,
				})
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
		if (
			busy ||
			(!OVERLAYS_ENABLED &&
				next !== 'Trim' &&
				next !== 'Crop' &&
				next !== 'Sound')
		)
			return
		setTool(next)
		if (next === 'Crop') crop.open()
		else send({ type: 'tool', draw: next === 'Paint', color, size })
	}
	function revert() {
		if (!ready || busy) return
		audioRequest.current++
		setStart(0)
		setEnd(duration)
		setPosition(0)
		setPlaying(false)
		setVolume(100)
		setMusicVolume(50)
		setSoundtrack(null)
		setLoadingAudio(false)
		setError('')
		setTool('Trim')
		crop.reset()
		setResetKey(value => value + 1)
		send({ type: 'revert' })
	}
	function save() {
		if (!ready || saving.current || loadingAudio) return
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
							style={{ flex: 1, backgroundColor: '#000000' }}
						>
							<KeyboardAvoidingView
								behavior="height"
								style={{ flex: 1, backgroundColor: '#000000' }}
							>
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										justifyContent: 'space-between',
										padding: 12,
									}}
								>
									<View style={{ flexDirection: 'row', gap: 4 }}>
										<EditorIconButton
											name="ArrowSmallLeftIcon"
											label="Cancel editing"
											onPress={close}
										/>
										<EditorIconButton
											name="UndoIcon"
											label="Revert all edits"
											disabled={!ready || busy}
											onPress={revert}
										/>
									</View>
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
										disabled={!ready || busy || loadingAudio}
										onPress={save}
									/>
								</View>
								<View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
									<WebView
										ref={web}
										source={html}
										style={{ flex: 1, backgroundColor: '#000000' }}
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
										backgroundColor: '#000000',
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
												<VideoControls
													tool={tool}
													playing={playing}
													resetKey={resetKey}
													onCommand={send}
													timeline={{
														duration,
														start,
														end,
														position,
														frames,
														onTrim: (from, to, edge) => {
															setStart(from)
															setEnd(to)
															send({
																type: 'trim',
																start: from,
																end: to,
																previewTime:
																	edge === 'start'
																		? from
																		: Math.max(from, to - 0.001),
															})
														},
														onSeek: time => send({ type: 'seek', time }),
														onFrames: (from, span, count) =>
															send({
																type: 'thumbnails',
																from,
																span,
																count,
																id: ++thumbnailRequest.current,
															}),
													}}
													sound={{
														volume,
														musicVolume,
														soundtrack,
														loading: loadingAudio,
														onVolume: setVolume,
														onMusicVolume: setMusicVolume,
														onPick: () => void addSoundtrack(),
														onRemove: () => {
															audioRequest.current++
															setSoundtrack(null)
															setLoadingAudio(false)
															send({ type: 'soundtrack', data: null })
														},
													}}
												>
													{tool === 'Crop' && (
														<CropPanel {...crop.panelProps} />
													)}
												</VideoControls>
												{tool !== 'Trim' &&
													tool !== 'Sound' &&
													tool !== 'Crop' && (
														<View style={{ height: 146 }}>
															<ScrollView
																keyboardShouldPersistTaps="handled"
																contentContainerStyle={{ gap: 10 }}
															>
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
																								style={{
																									width: 24,
																									height: 24,
																								}}
																							/>
																						)}
																						onPress={() => void emoji(value)}
																					/>
																				))}
																		</View>
																		{emojis.length === 0 && (
																			<Design.Text style={{ color: '#b5bac1' }}>
																				No server emojis loaded. Use Text to add
																				a keyboard emoji.
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
														justifyContent: 'space-around',
														gap: 4,
													}}
												>
													{(['Trim', 'Crop', 'Sound'] as const).map(value => (
														<EditorIconButton
															key={value}
															name={
																value === 'Sound'
																	? volume === 0 &&
																		(!soundtrack || musicVolume === 0)
																		? 'VoiceXIcon'
																		: 'VoiceNormalIcon'
																	: value
															}
															label={value}
															active={tool === value}
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
