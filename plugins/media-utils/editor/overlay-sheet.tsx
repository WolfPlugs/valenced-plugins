import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { useEffect, useRef, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, View } from 'react-native'
import canvasHtml from './canvas-document.generated'
import { EmojiDrawer } from './image/emoji-drawer'
import { loadEmojiImage } from './image/emoji-image'
import { MarkupPanel } from './image/markup-panel'
import { readEditorMedia } from './media-file'
import { saveEditorResult } from './save-result'
import { CropPanel } from './shared/crop-panel'
import { EditorIconButton } from './shared/editor-icon'
import { defaultTextStyle } from './shared/markup'
import { useCropControls } from './shared/use-crop-controls'
import { VideoControls } from './video/controls'
import { pickSoundtrack } from './video/soundtrack'
import type { EditorEmoji } from './image/emoji-drawer'
import type { CanvasCommand } from './protocol'
import type { EditorTool, OverlayProps, WebHandle } from './types'
import type { TimelineFrames } from './video/timeline'

const key = 'wolfie.media-utils.overlay'
const { SafeAreaProvider, SafeAreaView } = ReactNativeSafeAreaContext
let dismissEditor: (() => void) | undefined

function OverlaySheet({
	item,
	kind,
	WebView,
	onEdit,
	reportError,
	isCurrent,
}: OverlayProps) {
	const isImage = kind === 'image'
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
	const [tool, setTool] = useState<EditorTool>(isImage ? 'Crop' : 'Trim')
	const [markupTool, setMarkupTool] = useState<'Draw' | 'Emoji' | 'Text'>(
		'Draw',
	)
	const [drawHistory, setDrawHistory] = useState({ undo: false, redo: false })
	const emojiRequest = useRef(0)
	const [emojiOpen, setEmojiOpen] = useState(false)
	const [recentEmoji, setRecentEmoji] = useState<EditorEmoji[]>([])
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
		if (ready && kind === 'video') send({ type: 'trim', start, end })
	}, [start, end, ready])
	useEffect(() => {
		if (ready && !isImage)
			send({
				type: 'audio',
				volume: volume / 100,
				musicVolume: musicVolume / 100,
			})
	}, [volume, musicVolume, ready, isImage])
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
	async function insertEmoji(emoji: EditorEmoji) {
		if (!active.current || saving.current || !isCurrent()) return
		Keyboard.dismiss()
		setEmojiOpen(false)
		setRecentEmoji(list =>
			[
				emoji,
				...list.filter(
					item =>
						(typeof item === 'string' ? item : item.id) !==
						(typeof emoji === 'string' ? emoji : emoji.id),
				),
			].slice(0, 24),
		)
		const request = ++emojiRequest.current
		if (typeof emoji === 'string') {
			send({
				type: 'text',
				text: emoji,
				style: { ...defaultTextStyle, size: 42 },
			})
			return
		}
		try {
			const data = await loadEmojiImage(emoji.id)
			if (
				active.current &&
				isCurrent() &&
				!saving.current &&
				request === emojiRequest.current
			)
				send({ type: 'emoji', data })
		} catch (error) {
			if (request === emojiRequest.current && !saving.current) failed(error)
		}
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
			if (message.type === 'draw-history') {
				setDrawHistory({
					undo: 'undo' in message && message.undo === true,
					redo: 'redo' in message && message.redo === true,
				})
			} else if (message.type === 'soundtrack-error' && 'message' in message) {
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
					if (isImage)
						send({ type: 'crop', ratio: message.width / message.height })
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
		if (busy) return
		setTool(next)
		if (next === 'Crop') crop.open()
		else if (next !== 'Markup') send({ type: 'tool', draw: false })
	}
	function revert() {
		if (!ready || busy) return
		audioRequest.current++
		emojiRequest.current++
		setMarkupTool('Draw')
		setStart(0)
		setEnd(duration)
		setPosition(0)
		setPlaying(false)
		setVolume(100)
		setMusicVolume(50)
		setSoundtrack(null)
		setLoadingAudio(false)
		setError('')
		setTool(isImage ? 'Crop' : 'Trim')
		crop.reset()
		setResetKey(value => value + 1)
		send({ type: 'revert' })
		if (isImage) crop.openOriginal()
	}
	function save() {
		if (!ready || saving.current || loadingAudio) return
		saving.current = true
		setBusy(true)
		setError('')
		send({ type: 'export' })
	}
	const editor = (
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
							Edit {kind}
						</Design.Text>
						<Design.Button
							text={
								busy
									? isImage
										? 'Saving…'
										: `${Math.round(progress * 100)}%`
									: 'Save'
							}
							size="sm"
							disabled={!ready || busy || loadingAudio}
							onPress={save}
						/>
					</View>
					<View
						style={{ flex: 1, minHeight: 0, overflow: 'hidden', zIndex: 0 }}
					>
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
							zIndex: 1,
							backgroundColor: '#000000',
							padding: 12,
							gap: 12,
						}}
					>
						{error ? (
							<Design.Text style={{ color: '#ff858b' }}>{error}</Design.Text>
						) : null}
						{!ready && !error ? (
							<Design.Text style={{ color: '#ffffff' }}>
								Loading {kind}…
							</Design.Text>
						) : null}
						{busy ? (
							<Design.Text style={{ color: '#ffffff' }}>
								Saving {kind}… Keep this screen open.
							</Design.Text>
						) : (
							ready && (
								<>
									{isImage ? (
										tool === 'Crop' && <CropPanel {...crop.panelProps} />
									) : (
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
											{tool === 'Crop' && <CropPanel {...crop.panelProps} />}
										</VideoControls>
									)}
									{isImage && (
										<MarkupPanel
											key={resetKey}
											tool={tool === 'Markup' ? markupTool : undefined}
											onTool={setMarkupTool}
											send={send}
											history={drawHistory}
											onEmoji={() => {
												Keyboard.dismiss()
												setEmojiOpen(true)
											}}
										/>
									)}
									<View
										style={{
											flexDirection: 'row',
											justifyContent: 'space-around',
											gap: 4,
										}}
									>
										{isImage
											? (['Crop', 'Markup'] as const).map(value => (
													<EditorIconButton
														key={value}
														name={value === 'Markup' ? 'Decorations' : value}
														label={value === 'Markup' ? 'Decorations' : value}
														active={tool === value}
														onPress={() => choose(value)}
													/>
												))
											: (['Trim', 'Crop', 'Sound'] as const).map(value => (
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
				{emojiOpen && (
					<EmojiDrawer
						onClose={() => setEmojiOpen(false)}
						onEmoji={value => void insertEmoji(value)}
						recent={recentEmoji}
						reportError={reportError}
					/>
				)}
			</SafeAreaView>
		</SafeAreaProvider>
	)
	return (
		<Design.ActionSheet>
			<View style={{ height: 1 }}>
				<Modal
					visible={visible}
					animationType="slide"
					onRequestClose={emojiOpen ? () => setEmojiOpen(false) : close}
				>
					{editor}
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
