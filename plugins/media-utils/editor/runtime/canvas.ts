import { moveCrop } from '../shared/crop-geometry'
import { drawAdjusted } from '../shared/draw-adjusted'
import type { CanvasCommand } from '../protocol'
import type { CropBox, CropDrag, Point } from '../shared/crop-geometry'

declare global {
	interface Window {
		ReactNativeWebView: { postMessage(message: string): void }
		mediaCommand(command: CanvasCommand): void
	}
}

function runtime() {
	const canvas = document.createElement('canvas')
	document.body.append(canvas)
	const ctx = canvas.getContext('2d')!
	const media = document.createElement('video')
	media.playsInline = true
	media.preload = 'auto'
	media.style.display = 'none'
	document.body.append(media)
	let image: HTMLImageElement | undefined
	let url = ''
	let kind: 'image' | 'video' = 'image'
	let width = 1
	let height = 1
	let rotation = 0
	let flipped = false
	let straighten = 0,
		horizontal = 0,
		vertical = 0
	const adjustedSource = document.createElement('canvas')
	const adjustedContext = adjustedSource.getContext('2d')!
	let start = 0
	let end = 0
	let drawing = false
	let cropping = false
	let cropRatio = 0
	let cropStart: { x: number; y: number } | undefined
	let cropBox: CropBox | undefined
	let cropDrag: CropDrag | undefined
	let color = '#ffffff'
	let size = 24
	let exporting = false
	let recorder: MediaRecorder | undefined
	let seekingPreview = false
	let thumbnailVideo: HTMLVideoElement | undefined
	let captureFrame: (() => void) | undefined
	let audio: AudioContext | undefined
	let source: MediaElementAudioSourceNode | undefined
	let audioOutput: MediaStreamAudioDestinationNode | undefined
	let videoGain: GainNode | undefined
	let musicGain: GainNode | undefined
	let videoVolume = 1
	let musicVolume = 0.5
	let musicUrl = ''
	const soundtrack = document.createElement('audio')
	soundtrack.preload = 'auto'
	async function prepareAudio() {
		if (!audio) {
			audio = new AudioContext()
			source = audio.createMediaElementSource(media)
			const musicSource = audio.createMediaElementSource(soundtrack)
			videoGain = audio.createGain()
			musicGain = audio.createGain()
			const mix = audio.createDynamicsCompressor()
			mix.threshold.value = -1
			mix.knee.value = 0
			mix.ratio.value = 20
			mix.attack.value = 0.003
			mix.release.value = 0.1
			source.connect(videoGain).connect(mix)
			musicSource.connect(musicGain).connect(mix)
			audioOutput = audio.createMediaStreamDestination()
			mix.connect(audio.destination)
			mix.connect(audioOutput)
		}
		videoGain!.gain.value = videoVolume
		musicGain!.gain.value = musicVolume
		await audio.resume()
	}
	function syncSoundtrack() {
		soundtrack.pause()
		if (!musicUrl || !Number.isFinite(soundtrack.duration)) return
		const time = Math.max(0, media.currentTime - start)
		soundtrack.currentTime = Math.min(time, soundtrack.duration)
		if (!media.paused && time < soundtrack.duration)
			void soundtrack.play().catch(fail)
	}
	soundtrack.onloadedmetadata = () => {
		syncSoundtrack()
		send({ type: 'soundtrack-ready' })
	}
	soundtrack.onerror = () => {
		if (!musicUrl) return
		URL.revokeObjectURL(musicUrl)
		musicUrl = ''
		send({
			type: 'soundtrack-error',
			message:
				'This audio format cannot be opened. Choose an MP3, AAC, M4A, WAV, or Ogg file.',
		})
	}
	type Layer =
		| {
				kind: 'text'
				text: string
				color: string
				size: number
				x: number
				y: number
		  }
		| {
				kind: 'emoji'
				image: HTMLImageElement
				size: number
				x: number
				y: number
		  }
		| { kind: 'ink'; points: Point[]; color: string; size: number }
	const layers: Layer[] = []
	let selected: Exclude<Layer, { kind: 'ink' }> | undefined
	let stroke: Extract<Layer, { kind: 'ink' }> | undefined
	let last: Point | undefined
	const send = (value: unknown) =>
		window.ReactNativeWebView.postMessage(JSON.stringify(value))
	const fail = (error: unknown) =>
		send({
			type: 'error',
			message: error instanceof Error ? error.message : String(error),
		})
	function draw(showSelection = true) {
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		ctx.fillStyle = '#000000'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		const source = kind === 'image' ? image : media
		if (source && (kind === 'image' || media.readyState >= 2)) {
			if (
				adjustedSource.width !== canvas.width ||
				adjustedSource.height !== canvas.height
			) {
				adjustedSource.width = canvas.width
				adjustedSource.height = canvas.height
			}
			const adjusting = straighten !== 0 || horizontal !== 0 || vertical !== 0
			const target = adjusting ? adjustedContext : ctx
			if (adjusting) target.clearRect(0, 0, canvas.width, canvas.height)
			target.save()
			target.translate(canvas.width / 2, canvas.height / 2)
			target.scale(flipped ? -1 : 1, 1)
			target.rotate((rotation * Math.PI) / 2)
			target.drawImage(source, -width / 2, -height / 2, width, height)
			target.restore()
			if (adjusting)
				drawAdjusted(ctx, adjustedSource, { straighten, horizontal, vertical })
		}
		for (const layer of layers) {
			if (layer.kind === 'ink') {
				ctx.strokeStyle = layer.color
				ctx.lineWidth = layer.size
				ctx.lineCap = 'round'
				ctx.lineJoin = 'round'
				ctx.beginPath()
				layer.points.forEach((p, i) =>
					i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
				)
				ctx.stroke()
			} else if (layer.kind === 'text') {
				ctx.font = `bold ${layer.size}px sans-serif`
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.lineWidth = Math.max(2, layer.size / 14)
				ctx.strokeStyle = '#000000'
				ctx.fillStyle = layer.color
				ctx.strokeText(layer.text, layer.x, layer.y)
				ctx.fillText(layer.text, layer.x, layer.y)
			} else
				ctx.drawImage(
					layer.image,
					layer.x - layer.size / 2,
					layer.y - layer.size / 2,
					layer.size,
					layer.size,
				)
		}
		if (showSelection && cropping && cropBox) {
			const { x, y, width: w, height: h } = cropBox
			const scale =
				canvas.width / Math.max(1, canvas.getBoundingClientRect().width)
			ctx.save()
			ctx.fillStyle = 'rgba(0,0,0,0.55)'
			ctx.fillRect(0, 0, canvas.width, y)
			ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h)
			ctx.fillRect(0, y, x, h)
			ctx.fillRect(x + w, y, canvas.width - x - w, h)
			ctx.strokeStyle = '#ffffff'
			ctx.lineWidth = 1.2 * scale
			ctx.strokeRect(x, y, w, h)
			ctx.strokeStyle = 'rgba(255,255,255,0.5)'
			ctx.lineWidth = 0.6 * scale
			ctx.beginPath()
			for (let i = 1; i < 3; i++) {
				ctx.moveTo(x + (w * i) / 3, y)
				ctx.lineTo(x + (w * i) / 3, y + h)
				ctx.moveTo(x, y + (h * i) / 3)
				ctx.lineTo(x + w, y + (h * i) / 3)
			}
			ctx.stroke()
			ctx.strokeStyle = '#ffffff'
			ctx.lineWidth = 3 * scale
			const length = Math.min(18 * scale, w / 4, h / 4)
			for (const sx of [-1, 1])
				for (const sy of [-1, 1]) {
					const cx = sx < 0 ? x : x + w,
						cy = sy < 0 ? y : y + h
					ctx.beginPath()
					ctx.moveTo(cx - sx * length, cy)
					ctx.lineTo(cx, cy)
					ctx.lineTo(cx, cy - sy * length)
					ctx.stroke()
				}
			ctx.restore()
		}
	}

	function resize() {
		canvas.width = rotation % 2 ? height : width
		canvas.height = rotation % 2 ? width : height
		draw()
	}
	function ready() {
		const scale = Math.min(
			1,
			(kind === 'video' ? 1920 : 4096) / Math.max(width, height),
		)
		width = Math.max(2, Math.floor((width * scale) / 2) * 2)
		height = Math.max(2, Math.floor((height * scale) / 2) * 2)
		resize()
		send({
			type: 'ready',
			width,
			height,
			duration: end,
			videoSupported:
				typeof MediaRecorder !== 'undefined' &&
				typeof canvas.captureStream === 'function',
		})
	}
	media.onloadedmetadata = () => {
		width = media.videoWidth
		height = media.videoHeight
		end = media.duration
		ready()
	}
	media.onseeking = () => {
		seekingPreview = true
	}
	media.onseeked = () => {
		seekingPreview = false
		syncSoundtrack()
		draw()
		send({ type: 'playhead', time: media.currentTime, playing: !media.paused })
	}
	media.onloadeddata = () => draw()
	media.onerror = () =>
		fail(new Error('This video format cannot be opened by Android WebView.'))
	function point(event: PointerEvent): Point {
		const rect = canvas.getBoundingClientRect()
		return {
			x: ((event.clientX - rect.left) * canvas.width) / rect.width,
			y: ((event.clientY - rect.top) * canvas.height) / rect.height,
		}
	}
	canvas.onpointerdown = event => {
		if (exporting) return
		canvas.setPointerCapture(event.pointerId)
		last = point(event)
		if (cropping && cropBox) {
			const box = cropBox
			const hit =
				(18 * canvas.width) / Math.max(1, canvas.getBoundingClientRect().width)
			const nearX = last.x >= box.x - hit && last.x <= box.x + box.width + hit
			const nearY = last.y >= box.y - hit && last.y <= box.y + box.height + hit
			const left = nearY && Math.abs(last.x - box.x) <= hit,
				right = nearY && !left && Math.abs(last.x - box.x - box.width) <= hit
			const top = nearX && Math.abs(last.y - box.y) <= hit,
				bottom = nearX && !top && Math.abs(last.y - box.y - box.height) <= hit
			const inside =
				last.x >= box.x &&
				last.x <= box.x + box.width &&
				last.y >= box.y &&
				last.y <= box.y + box.height
			if (!inside && !left && !right && !top && !bottom) {
				last = undefined
				return
			}
			cropStart = last
			cropDrag = {
				box: { ...box },
				left,
				right,
				top,
				bottom,
				move: !left && !right && !top && !bottom,
			}
			return
		}
		if (drawing) {
			stroke = {
				kind: 'ink',
				points: [last],
				color,
				size: (size * canvas.width) / 400,
			}
			layers.push(stroke)
		} else {
			selected = undefined
			for (let i = layers.length - 1; i >= 0; i--) {
				const layer = layers[i]
				if (layer.kind === 'ink') continue
				const halfWidth =
					layer.kind === 'emoji'
						? layer.size / 2
						: Math.max(layer.size, layer.text.length * layer.size * 0.35)
				if (
					Math.abs(layer.x - last.x) < halfWidth &&
					Math.abs(layer.y - last.y) < layer.size
				) {
					selected = layer
					break
				}
			}
		}
	}
	canvas.onpointermove = event => {
		if (!last || exporting) return
		const next = point(event)
		if (cropping && cropStart && cropDrag) {
			cropBox = moveCrop(
				cropDrag.box,
				next.x - cropStart.x,
				next.y - cropStart.y,
				cropDrag,
				{
					width: canvas.width,
					height: canvas.height,
					displayWidth: canvas.getBoundingClientRect().width,
				},
				cropRatio,
			)
		} else if (stroke) stroke.points.push(next)
		else if (selected) {
			selected.x += next.x - last.x
			selected.y += next.y - last.y
		}
		last = next
		draw()
	}
	canvas.onpointerup = canvas.onpointercancel = () => {
		last = undefined
		cropStart = undefined
		cropDrag = undefined
		stroke = undefined
	}
	async function encode() {
		if (exporting) return
		if (kind === 'image') {
			draw(false)
			const output = document.createElement('canvas')
			const bounds = cropBox ?? {
				x: 0,
				y: 0,
				width: canvas.width,
				height: canvas.height,
			}
			output.width = Math.max(1, Math.round(bounds.width))
			output.height = Math.max(1, Math.round(bounds.height))
			output
				.getContext('2d')!
				.drawImage(
					canvas,
					bounds.x,
					bounds.y,
					bounds.width,
					bounds.height,
					0,
					0,
					output.width,
					output.height,
				)
			send({
				type: 'result',
				mime: 'image/png',
				width: output.width,
				height: output.height,
				data: output.toDataURL('image/png').split(',')[1],
			})
			draw()
			return
		}
		if (
			!(
				Number.isFinite(end) &&
				end > start &&
				start >= 0 &&
				end <= media.duration
			)
		)
			throw new Error('Choose a valid start and end time.')
		const mime = [
			'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
			'video/webm;codecs=vp8,opus',
			'video/webm',
		].find(value => MediaRecorder.isTypeSupported(value))
		if (!mime)
			throw new Error('Video export is unavailable in this Android WebView.')
		exporting = true
		media.pause()
		media.currentTime = start
		if (media.seeking)
			await new Promise<void>(resolve =>
				media.addEventListener('seeked', () => resolve(), { once: true }),
			)
		const bounds = cropBox ?? {
			x: 0,
			y: 0,
			width: canvas.width,
			height: canvas.height,
		}
		const output = document.createElement('canvas')
		output.width = Math.max(2, Math.floor(bounds.width / 2) * 2)
		output.height = Math.max(2, Math.floor(bounds.height / 2) * 2)
		const outputContext = output.getContext('2d')!
		const copyFrame = () =>
			outputContext.drawImage(
				canvas,
				bounds.x,
				bounds.y,
				bounds.width,
				bounds.height,
				0,
				0,
				output.width,
				output.height,
			)
		captureFrame = copyFrame
		draw(false)
		copyFrame()
		const stream = output.captureStream(30)
		await prepareAudio()
		if (musicUrl && !Number.isFinite(soundtrack.duration))
			throw new Error('Wait for the soundtrack to finish loading.')
		if (videoVolume > 0 || (musicUrl && musicVolume > 0)) {
			for (const track of audioOutput!.stream.getAudioTracks())
				stream.addTrack(track)
		}
		const chunks: Blob[] = []
		let bytes = 0
		recorder = new MediaRecorder(stream, {
			mimeType: mime,
			videoBitsPerSecond: 8_000_000,
		})
		recorder.ondataavailable = event => {
			bytes += event.data.size
			if (bytes > 64 * 1024 * 1024) {
				window.mediaCommand({ type: 'cancel' })
				fail(
					new Error(
						'The edited video exceeds the 64 MB export limit. Trim a shorter clip.',
					),
				)
			} else chunks.push(event.data)
		}
		recorder.onerror = () => {
			window.mediaCommand({ type: 'cancel' })
			fail(new Error('Android WebView could not encode this video.'))
		}
		recorder.onstop = () => {
			captureFrame = undefined
			stream.getTracks().forEach(track => track.stop())
			if (!exporting) return
			exporting = false
			media.pause()
			soundtrack.pause()
			const reader = new FileReader()
			reader.onload = () => {
				if (typeof reader.result === 'string')
					send({
						type: 'result',
						mime: mime.startsWith('video/mp4') ? 'video/mp4' : 'video/webm',
						width: output.width,
						height: output.height,
						duration: end - start,
						data: reader.result.slice(reader.result.indexOf(';base64,') + 8),
					})
			}
			reader.onerror = () =>
				fail(new Error('Could not read the exported video.'))
			reader.readAsDataURL(new Blob(chunks, { type: mime }))
		}
		draw()
		recorder.start(1000)
		await media.play()
	}
	function frame() {
		if (kind === 'video' && !media.paused) {
			draw(!exporting)
			captureFrame?.()
			if (exporting) {
				send({
					type: 'progress',
					value: Math.min(1, (media.currentTime - start) / (end - start)),
				})
				if (media.currentTime >= end || media.ended) {
					media.pause()
					if (recorder?.state === 'recording') recorder.stop()
				}
			} else if (media.currentTime >= end) media.pause()
		}
		requestAnimationFrame(frame)
	}
	function playhead() {
		if (!seekingPreview && !media.seeking)
			send({
				type: 'playhead',
				time: media.currentTime,
				playing: !media.paused,
			})
	}
	media.ontimeupdate = playhead
	media.onplay = () => {
		syncSoundtrack()
		playhead()
	}
	media.onpause = () => {
		soundtrack.pause()
		playhead()
	}
	media.onended = () => {
		if (recorder?.state === 'recording') recorder.stop()
	}
	window.mediaCommand = command => {
		try {
			if (command.type === 'cancel') {
				thumbnailVideo?.removeAttribute('src')
				thumbnailVideo?.load()
				thumbnailVideo = undefined
				exporting = false
				if (recorder?.state === 'recording') recorder.stop()
				media.pause()
				soundtrack.pause()
				void audio?.suspend()
				return
			}
			if (exporting) return
			switch (command.type) {
				case 'audio':
					videoVolume = Math.max(0, Math.min(1, command.volume))
					musicVolume = Math.max(0, Math.min(1, command.musicVolume))
					void prepareAudio().catch(fail)
					break
				case 'soundtrack': {
					soundtrack.pause()
					if (musicUrl) URL.revokeObjectURL(musicUrl)
					musicUrl = ''
					soundtrack.removeAttribute('src')
					if (command.data !== null) {
						const bytes = Uint8Array.from(atob(command.data), c =>
							c.charCodeAt(0),
						)
						musicUrl = URL.createObjectURL(
							new Blob([bytes], { type: command.mime ?? 'audio/mpeg' }),
						)
						soundtrack.src = musicUrl
					}
					soundtrack.load()
					break
				}
				case 'seek':
					media.pause()
					media.currentTime = Math.max(start, Math.min(end, command.time))
					break
				case 'thumbnails': {
					if (thumbnailVideo) {
						thumbnailVideo.onloadeddata =
							thumbnailVideo.onseeked =
							thumbnailVideo.onerror =
								null
						thumbnailVideo.removeAttribute('src')
						thumbnailVideo.load()
					}
					const video = document.createElement('video')
					thumbnailVideo = video
					video.muted = true
					video.preload = 'auto'
					const thumbnail = document.createElement('canvas')
					thumbnail.width = thumbnail.height = 192
					const context = thumbnail.getContext('2d')!
					const frames: string[] = []
					const id = command.id
					const count = Math.max(4, Math.min(16, Math.round(command.count)))
					const from = Math.max(0, Math.min(media.duration, command.from))
					const span = Math.max(
						0,
						Math.min(media.duration - from, command.span),
					)
					function dispose() {
						video.onloadeddata = video.onseeked = video.onerror = null
						video.removeAttribute('src')
						video.load()
						if (thumbnailVideo === video) thumbnailVideo = undefined
					}
					function next() {
						const time = Math.min(
							Math.max(0, video.duration - 0.001),
							from + ((frames.length + 0.5) / count) * span,
						)
						if (
							Math.abs(video.currentTime - time) < 0.000001 &&
							video.readyState >= 2
						)
							capture()
						else video.currentTime = time
					}
					function capture() {
						if (thumbnailVideo !== video) return
						const side = Math.min(video.videoWidth, video.videoHeight)
						context.drawImage(
							video,
							(video.videoWidth - side) / 2,
							(video.videoHeight - side) / 2,
							side,
							side,
							0,
							0,
							192,
							192,
						)
						frames.push(thumbnail.toDataURL('image/jpeg', 0.85))
						if (frames.length < count) next()
						else {
							send({ type: 'thumbnails', id, from, span, frames })
							dispose()
						}
					}
					video.onloadeddata = next
					video.onseeked = capture
					video.onerror = dispose
					video.src = url
					break
				}
				case 'load': {
					cropBox = undefined
					cropping = false
					layers.length = 0
					selected = undefined
					rotation = 0
					flipped = false
					straighten = horizontal = vertical = 0
					start = 0
					end = 0
					if (url) URL.revokeObjectURL(url)
					const binary = atob(command.data)
					const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
					url = URL.createObjectURL(new Blob([bytes], { type: command.mime }))
					kind = command.kind
					if (kind === 'video') {
						media.src = url
						media.load()
					} else {
						image = new Image()
						image.onload = () => {
							width = image!.naturalWidth
							height = image!.naturalHeight
							ready()
						}
						image.onerror = () => fail(new Error('Could not open this image.'))
						image.src = url
					}
					break
				}
				case 'crop': {
					media.pause()
					cropping = true
					drawing = false
					const ratioChanged =
						command.ratio !== undefined && command.ratio !== cropRatio
					cropRatio = command.ratio ?? cropRatio
					if (!cropBox || ratioChanged) {
						const w =
							cropRatio > 0
								? Math.min(canvas.width, canvas.height * cropRatio)
								: canvas.width
						const h = cropRatio > 0 ? w / cropRatio : canvas.height
						cropBox = {
							x: (canvas.width - w) / 2,
							y: (canvas.height - h) / 2,
							width: w,
							height: h,
						}
					}
					break
				}
				case 'reset-crop':
					cropBox = undefined
					cropRatio = 0
					cropping = false
					rotation = 0
					flipped = false
					straighten = horizontal = vertical = 0
					resize()
					break
				case 'tool':
					cropping = false
					drawing = command.draw
					color = command.color
					size = command.size
					if (selected) {
						selected.size = (size * canvas.width) / 400
						if (selected.kind === 'text') selected.color = color
					}
					break
				case 'text':
					cropping = false
					selected = {
						kind: 'text',
						text: command.text,
						color: command.color,
						size: (command.size * canvas.width) / 400,
						x: canvas.width / 2,
						y: canvas.height / 2,
					}
					layers.push(selected)
					drawing = false
					break
				case 'emoji': {
					cropping = false
					const emoji = new Image()
					emoji.onload = () => {
						selected = {
							kind: 'emoji',
							image: emoji,
							size: canvas.width / 5,
							x: canvas.width / 2,
							y: canvas.height / 2,
						}
						layers.push(selected)
						draw()
					}
					emoji.onerror = () => fail(new Error('Could not load this emoji.'))
					emoji.src = command.data
					drawing = false
					break
				}
				case 'adjust-angle':
					if (
						![command.straighten, command.horizontal, command.vertical].every(
							Number.isFinite,
						)
					)
						throw new Error('Invalid angle adjustment')
					straighten = Math.max(-45, Math.min(45, command.straighten))
					horizontal = Math.max(-45, Math.min(45, command.horizontal)) * 0.8
					vertical = Math.max(-45, Math.min(45, command.vertical)) * 0.8
					break
				case 'flip':
					flipped = !flipped
					break
				case 'rotate':
					cropBox = undefined
					rotation = (rotation + 1) % 4
					resize()
					break
				case 'revert':
					media.pause()
					soundtrack.pause()
					if (musicUrl) URL.revokeObjectURL(musicUrl)
					musicUrl = ''
					soundtrack.removeAttribute('src')
					soundtrack.load()
					videoVolume = 1
					musicVolume = 0.5
					if (videoGain) videoGain.gain.value = videoVolume
					if (musicGain) musicGain.gain.value = musicVolume
					start = 0
					end = media.duration
					rotation = 0
					flipped = false
					straighten = horizontal = vertical = 0
					cropBox = undefined
					cropRatio = 0
					cropStart = undefined
					cropDrag = undefined
					cropping = drawing = false
					layers.length = 0
					selected = undefined
					stroke = undefined
					last = undefined
					media.currentTime = 0
					resize()
					break
				case 'undo':
					layers.pop()
					selected = undefined
					break
				case 'trim':
					start = command.start
					end = command.end
					media.muted = false
					if (command.previewTime !== undefined) media.pause()
					media.currentTime = Math.max(
						start,
						Math.min(
							Math.max(start, end - 0.001),
							command.previewTime ?? media.currentTime,
						),
					)
					break
				case 'preview':
					if (kind === 'video') {
						if (media.paused) {
							media.currentTime = start
							void prepareAudio()
								.then(() => media.play())
								.catch(fail)
						} else media.pause()
					}
					break
				case 'export':
					void encode().catch(error => {
						window.mediaCommand({ type: 'cancel' })
						fail(error)
					})
					break
			}
			if (!media.seeking) draw()
		} catch (error) {
			fail(error)
		}
	}
	frame()
	send({ type: 'boot' })
}

runtime()
