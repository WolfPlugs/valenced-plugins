import { Dispatcher } from '@valenced/discord/common/flux'
import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { FileModule } from '@valenced/discord/native'
import { readSettings } from '../settings/config'
import { base64, rangeReader } from './download'
import { extractPreview, fileFormat, orientJpeg, previewPlan } from './formats'
import { matroskaDimensions } from './matroska'
import { psdComposite } from './psd-composite'
import type { DiscordModules } from '@valenced/discord/types'
import type { SettingsStore } from '../settings/config'
import type { FileFormat } from './formats'

const settingsListeners = new Set<() => void>()
export function refreshFilePreviews() {
	for (const listener of settingsListeners) listener()
}

type Attachment = {
	raw: object
	id: string
	filename: string
	url: string
	format: FileFormat | 'mkv'
}
function attachment(value: unknown): Attachment | undefined {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('id' in value) ||
		typeof value.id !== 'string' ||
		!/^\d{1,20}$/.test(value.id) ||
		!('filename' in value) ||
		typeof value.filename !== 'string' ||
		!('url' in value) ||
		typeof value.url !== 'string' ||
		!/^https:\/\//i.test(value.url)
	)
		return
	const format = /\.mkv$/i.test(value.filename)
		? 'mkv'
		: fileFormat(value.filename)
	if (format)
		return {
			raw: value,
			id: value.id,
			filename: value.filename,
			url: value.url,
			format,
		}
}

type Preview = {
	uri: string
	width: number
	height: number
	size: number
	mimeType: 'image/png' | 'image/jpeg'
	filename: string
}
type VideoPreview = {
	mimeType: 'video/x-matroska'
	width: number
	height: number
}
// Discord classifies MKV attachments as generic files even with video metadata.
// A video embed selects the player without adding another attachment.
const mkvProvider = 'MediaUtils MKV preview'
function isMkvPreview(value: unknown) {
	if (typeof value !== 'object' || value === null || !('provider' in value))
		return false
	const { provider } = value
	return (
		typeof provider === 'object' &&
		provider !== null &&
		'name' in provider &&
		provider.name === mkvProvider
	)
}

type Target = { channel: string; message: string }
const folder = 'media-utils-file-previews'

export function patchFilePreviews(
	cleanup: (callback: () => void) => void,
	store: SettingsStore,
	reportError: (error: unknown) => void,
) {
	const cacheFolder = `${folder}-${Date.now()}`
	let active = true
	let running = false
	let cachedBytes = 0
	const controller = new AbortController()
	const previews = new Map<string, Preview | VideoPreview>()
	const previewIds = new Set<string>()
	const failed = new Set<string>()
	const pending = new Set<string>()
	const queue: (Attachment & { quality: boolean; key: string })[] = []
	const targets = new Map<string, Target>()
	const timers = new Set<ReturnType<typeof setTimeout>>()
	const enabled = (format: FileFormat | 'mkv') => {
		const settings = readSettings(store.cache)
		return format === 'mkv'
			? settings.previewMkv
			: format === 'psd'
				? settings.previewPsd
				: settings.previewNef
	}
	function storedMessage(target: Target) {
		const messageStore = Stores.MessageStore as DiscordModules.Flux.Store<{
			getMessage(channel: string, message: string): unknown
		}>
		return messageStore?.getMessage(target.channel, target.message)
	}
	function refresh(target: Target) {
		const timer = setTimeout(() => {
			timers.delete(timer)
			if (!active) return
			const message = storedMessage(target)
			if (
				typeof message !== 'object' ||
				message === null ||
				!('attachments' in message) ||
				!Array.isArray(message.attachments)
			)
				return
			Dispatcher.dispatch({
				type: 'MESSAGE_UPDATE',
				message: {
					id: target.message,
					channel_id: target.channel,
					attachments: message.attachments,
					...('embeds' in message && Array.isArray(message.embeds)
						? { embeds: message.embeds }
						: {}),
					...('flags' in message ? { flags: message.flags } : {}),
				},
			})
		}, 0)
		timers.add(timer)
	}
	async function pump() {
		if (running) return
		running = true
		try {
			while (active && queue.length) {
				const item = queue.shift()
				if (!item) break
				const download = new AbortController()
				const abort = () => download.abort()
				controller.signal.addEventListener('abort', abort)
				const timeout = setTimeout(abort, 30_000)
				try {
					if (!enabled(item.format)) continue
					const read = rangeReader(item.url, download.signal)
					if (item.format === 'mkv') {
						const dimensions = await matroskaDimensions(read)
						if (!active || !enabled(item.format)) continue
						if (!dimensions) {
							failed.add(item.key)
							continue
						}
						previews.set(item.key, {
							...dimensions,
							mimeType: 'video/x-matroska',
						})
						for (const target of targets.values()) refresh(target)
						continue
					}
					const format = item.format
					let composite: Awaited<ReturnType<typeof psdComposite>> | undefined
					if (item.quality && item.format === 'psd') {
						try {
							composite = await psdComposite(read)
						} catch (error) {
							if (!active || download.signal.aborted) throw error
							reportError(
								new Error(
									`MediaUtils: high-quality preview unavailable for ${item.filename}; trying its thumbnail. ${error instanceof Error ? error.message : String(error)}`,
								),
							)
						}
					}
					const result =
						composite ??
						(await (async () => {
							const jpeg = await extractPreview(read, format, item.quality)
							return {
								...jpeg,
								bytes: orientJpeg(jpeg.jpeg, jpeg.orientation),
								mimeType: 'image/jpeg' as const,
								extension: 'jpg' as const,
							}
						})())
					if (!active || !enabled(item.format)) continue
					if (cachedBytes + result.bytes.length > 48 * 1024 * 1024) continue
					const filename = `${item.id}-${item.quality ? 'high' : 'standard'}.${result.extension}`

					const path = await FileModule.writeFile(
						'cache',
						`${cacheFolder}/${filename}`,
						base64(result.bytes),
						'base64',
					)
					if (!active) {
						await FileModule.removeFile('cache', `${cacheFolder}/${filename}`)
						continue
					}
					const rotated = result.orientation >= 5
					previews.set(item.key, {
						uri: path.startsWith('file://') ? path : `file://${path}`,
						width: rotated ? result.height : result.width,
						height: rotated ? result.width : result.height,
						size: result.bytes.length,
						mimeType: result.mimeType,
						filename,
					})
					cachedBytes += result.bytes.length
					for (const target of targets.values()) refresh(target)
				} catch (error) {
					if (active) {
						failed.add(item.key)
						reportError(
							new Error(
								`MediaUtils could not preview ${item.filename}: ${error instanceof Error ? error.message : String(error)}`,
							),
						)
					}
				} finally {
					clearTimeout(timeout)
					controller.signal.removeEventListener('abort', abort)
					pending.delete(item.key)
					// A missing thumbnail must not prevent trying the full-size image.
					if (active && failed.has(item.key) && !item.quality)
						for (const target of targets.values()) refresh(target)
				}
			}
		} finally {
			running = false
		}
	}
	function patchMessage(value: unknown, channel?: unknown) {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('attachments' in value) ||
			!Array.isArray(value.attachments)
		)
			return
		const channelId = 'channel_id' in value ? value.channel_id : channel
		const messageId = 'id' in value ? value.id : undefined
		const originals = value.attachments.filter(
			(a: unknown) =>
				!(
					typeof a === 'object' &&
					a !== null &&
					'id' in a &&
					typeof a.id === 'string' &&
					previewIds.has(a.id)
				),
		)
		const extras: object[] = []
		const existingEmbeds =
			'embeds' in value && Array.isArray(value.embeds) ? value.embeds : []
		const videoEmbeds: object[] = []
		for (const raw of originals) {
			const item = attachment(raw)
			if (!item) continue
			if (
				item.format === 'mkv' &&
				(item.filename.startsWith('SPOILER_') ||
					('spoiler' in item.raw && item.raw.spoiler === true) ||
					('flags' in value &&
						typeof value.flags === 'number' &&
						(value.flags & 4) !== 0))
			)
				continue
			if (typeof channelId === 'string' && typeof messageId === 'string') {
				targets.set(`${channelId}/${messageId}`, {
					channel: channelId,
					message: messageId,
				})
				if (targets.size > 128) {
					const first = targets.keys().next().value
					if (first) targets.delete(first)
				}
			}
			if (!enabled(item.format)) continue
			const plan = previewPlan(
				item.format !== 'mkv' && readSettings(store.cache).highQualityPreviews,
				{
					standard: previews.has(`${item.id}:false`),
					high: previews.has(`${item.id}:true`),
					standardFailed: failed.has(`${item.id}:false`),
				},
			)
			const quality = plan.request === 'high'
			const key = `${item.id}:${quality}`
			const preview =
				plan.display === undefined
					? undefined
					: previews.get(`${item.id}:${plan.display === 'high'}`)
			if (preview) {
				if (preview.mimeType === 'video/x-matroska') {
					videoEmbeds.push({
						type: 'video',
						url: item.url,
						provider: { name: mkvProvider },
						video: {
							url: item.url,
							proxy_url: item.url,
							width: preview.width,
							height: preview.height,
						},
					})
				} else {
					const id = (BigInt(item.id) ^ (1n << 62n)).toString()
					previewIds.add(id)
					extras.push({
						...item.raw,
						...preview,
						id,
						filename: `${item.filename.startsWith('SPOILER_') ? 'SPOILER_' : ''}Preview-${item.filename}.${preview.mimeType === 'image/png' ? 'png' : 'jpg'}`,
						content_type: preview.mimeType,
						url: preview.uri,
						proxy_url: preview.uri,
					})
				}
			}
			if (
				plan.request !== undefined &&
				!pending.has(key) &&
				!failed.has(key) &&
				pending.size < 32 &&
				previews.size < 64 &&
				(item.format === 'mkv' || cachedBytes < 48 * 1024 * 1024)
			) {
				pending.add(key)
				queue.push({ ...item, quality, key })
				void pump()
			}
		}
		value.attachments = [...extras, ...originals]
		if (videoEmbeds.length || existingEmbeds.some(isMkvPreview))
			Object.assign(value, {
				embeds: [
					...existingEmbeds.filter(embed => !isMkvPreview(embed)),
					...videoEmbeds,
				],
			})
	}
	const changed = () => {
		failed.clear()
		for (const target of targets.values()) refresh(target)
	}
	settingsListeners.add(changed)
	for (const type of [
		'MESSAGE_CREATE',
		'MESSAGE_UPDATE',
		'LOAD_MESSAGES_SUCCESS',
		'LOAD_MESSAGES_AROUND_SUCCESS',
		'LOAD_PINNED_MESSAGES_SUCCESS',
		'LOAD_RECENT_MENTIONS_SUCCESS',
	] as const) {
		cleanup(
			onFluxEventDispatched<{
				message?: unknown
				messages?: unknown
				channelId?: unknown
			}>(type, payload => {
				if (active) {
					patchMessage(payload.message, payload.channelId)
					if (Array.isArray(payload.messages))
						for (const message of payload.messages)
							patchMessage(message, payload.channelId)
				}
				return payload
			}),
		)
	}
	cleanup(() => {
		active = false
		controller.abort()
		queue.length = 0
		settingsListeners.delete(changed)
		for (const timer of timers) clearTimeout(timer)
		// Remove our previews before unregistering the event patch; originals remain intact.
		for (const target of targets.values()) {
			const message = storedMessage(target)
			if (
				typeof message !== 'object' ||
				message === null ||
				!('attachments' in message) ||
				!Array.isArray(message.attachments)
			)
				continue
			const originals = message.attachments.filter(
				(a: unknown) =>
					!(
						typeof a === 'object' &&
						a !== null &&
						'id' in a &&
						typeof a.id === 'string' &&
						previewIds.has(a.id)
					),
			)
			Dispatcher.dispatch({
				type: 'MESSAGE_UPDATE',
				message: {
					id: target.message,
					channel_id: target.channel,
					attachments: originals,
					...('embeds' in message &&
					Array.isArray(message.embeds) &&
					message.embeds.some(isMkvPreview)
						? { embeds: message.embeds.filter(embed => !isMkvPreview(embed)) }
						: {}),
				},
			})
		}
		for (const preview of previews.values())
			if (preview.mimeType !== 'video/x-matroska')
				void FileModule.removeFile(
					'cache',
					`${cacheFolder}/${preview.filename}`,
				).catch(reportError)
	})
}
