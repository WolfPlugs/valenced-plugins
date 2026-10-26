export type CanvasCommand =
	| { type: 'load'; data: string; kind: 'image' | 'video'; mime: string }
	| { type: 'crop'; ratio?: number }
	| { type: 'reset-crop' }
	| { type: 'seek'; time: number }
	| { type: 'thumbnails' }
	| { type: 'tool'; draw: boolean; color: string; size: number }
	| { type: 'text'; text: string; color: string; size: number }
	| { type: 'emoji'; data: string }
	| { type: 'rotate' | 'undo' | 'preview' | 'export' | 'cancel' }
	| { type: 'trim'; start: number; end: number; muted: boolean }

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
	let start = 0
	let end = 0
	let muted = false
	let drawing = false
	let cropping = false
	let cropRatio = 0
	let cropStart: { x: number; y: number } | undefined
	let cropBox:
		| { x: number; y: number; width: number; height: number }
		| undefined
	let color = '#ffffff'
	let size = 24
	let exporting = false
	let recorder: MediaRecorder | undefined
	let captureFrame: (() => void) | undefined
	let audio: AudioContext | undefined
	let source: MediaElementAudioSourceNode | undefined
	let audioOutput: MediaStreamAudioDestinationNode | undefined
	type Point = { x: number; y: number }
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
		ctx.save()
		ctx.translate(canvas.width / 2, canvas.height / 2)
		ctx.rotate((rotation * Math.PI) / 2)
		const source = kind === 'image' ? image : media
		if (source && (kind === 'image' || media.readyState >= 2))
			ctx.drawImage(source, -width / 2, -height / 2, width, height)
		ctx.restore()
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
		if (showSelection && cropBox) {
			ctx.strokeStyle = '#ffffff'
			ctx.lineWidth = Math.max(2, canvas.width / 400)
			ctx.setLineDash([10, 5])
			ctx.strokeRect(cropBox.x, cropBox.y, cropBox.width, cropBox.height)
			ctx.setLineDash([])
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
	media.onseeked = () => draw()
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
		if (cropping) {
			cropStart = last
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
		if (cropping && cropStart) {
			const x = Math.max(
				0,
				Math.min(canvas.width - 1, Math.min(cropStart.x, next.x)),
			)
			const y = Math.max(
				0,
				Math.min(canvas.height - 1, Math.min(cropStart.y, next.y)),
			)
			let width = Math.max(
				1,
				Math.min(canvas.width - x, Math.abs(next.x - cropStart.x)),
			)
			let height = Math.max(
				1,
				Math.min(canvas.height - y, Math.abs(next.y - cropStart.y)),
			)
			if (cropRatio > 0) {
				width = Math.min(width, (canvas.height - y) * cropRatio)
				height = width / cropRatio
			}
			cropBox = { x, y, width, height }
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
		if (!muted) {
			audio ??= new AudioContext()
			source ??= audio.createMediaElementSource(media)
			audioOutput = audio.createMediaStreamDestination()
			source.disconnect()
			source.connect(audioOutput)
			await audio.resume()
			for (const track of audioOutput.stream.getAudioTracks())
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
			if (audio && source) {
				source.disconnect()
				source.connect(audio.destination)
			}
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
	media.ontimeupdate = () =>
		send({ type: 'playhead', time: media.currentTime, playing: !media.paused })
	media.onplay = media.onpause = () =>
		send({ type: 'playhead', time: media.currentTime, playing: !media.paused })
	media.onended = () => {
		if (recorder?.state === 'recording') recorder.stop()
	}
	window.mediaCommand = command => {
		try {
			if (command.type === 'cancel') {
				exporting = false
				if (recorder?.state === 'recording') recorder.stop()
				media.pause()
				void audio?.close()
				audio = undefined
				source = undefined
				audioOutput = undefined
				return
			}
			if (exporting) return
			switch (command.type) {
				case 'seek':
					media.pause()
					media.currentTime = Math.max(start, Math.min(end, command.time))
					break
				case 'thumbnails': {
					const video = document.createElement('video')
					video.muted = true
					video.preload = 'auto'
					const thumbnail = document.createElement('canvas')
					thumbnail.width = 96
					thumbnail.height = 72
					const context = thumbnail.getContext('2d')!
					const frames: string[] = []
					video.onloadeddata = () => {
						video.currentTime = Math.min(0.01, video.duration / 2)
					}
					video.onseeked = () => {
						context.drawImage(video, 0, 0, 96, 72)
						frames.push(thumbnail.toDataURL('image/jpeg', 0.65))
						if (frames.length < 8)
							video.currentTime = Math.min(
								video.duration - 0.01,
								(frames.length / 8) * video.duration,
							)
						else {
							send({ type: 'thumbnails', frames })
							video.removeAttribute('src')
							video.load()
						}
					}
					video.onerror = () => {
						video.removeAttribute('src')
						video.load()
					}
					video.src = url
					break
				}
				case 'load': {
					cropBox = undefined
					cropping = false
					layers.length = 0
					selected = undefined
					rotation = 0
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
				case 'crop':
					cropping = true
					cropRatio = command.ratio ?? 0
					drawing = false
					if (command.ratio && command.ratio > 0) {
						const width = Math.min(canvas.width, canvas.height * command.ratio)
						const height = width / command.ratio
						cropBox = {
							x: (canvas.width - width) / 2,
							y: (canvas.height - height) / 2,
							width,
							height,
						}
					}
					break
				case 'reset-crop':
					cropBox = undefined
					cropping = false
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
				case 'rotate':
					cropBox = undefined
					rotation = (rotation + 1) % 4
					resize()
					break
				case 'undo':
					layers.pop()
					selected = undefined
					break
				case 'trim':
					start = command.start
					end = command.end
					muted = command.muted
					media.muted = muted
					media.currentTime = start
					break
				case 'preview':
					if (kind === 'video') {
						if (media.paused) {
							media.currentTime = start
							void media.play().catch(fail)
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
			draw()
		} catch (error) {
			fail(error)
		}
	}
	frame()
	send({ type: 'boot' })
}

export function canvasDocument() {
	return `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;height:100%;background:#111214;display:flex;align-items:center;justify-content:center;overflow:hidden}canvas{max-width:100%;max-height:100%;object-fit:contain;touch-action:none}</style><body><script>(${runtime.toString()})()</script>`
}
