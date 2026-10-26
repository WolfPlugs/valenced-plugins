import { Dispatcher } from '@valenced/discord/common/flux'
import { FileModule } from '@valenced/discord/native'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { detectMedia } from './media-format'
import { gifCandidates } from './media-urls'
import type { MediaFormat } from './media-format'
import type { Gif } from './media-urls'

export function getChannelId(refs: unknown): string | undefined {
	if (typeof refs !== 'object' || refs === null || !('props' in refs)) return
	const props = refs.props
	if (typeof props !== 'object' || props === null || !('current' in props))
		return
	const current = props.current
	if (
		typeof current !== 'object' ||
		current === null ||
		!('channel' in current)
	)
		return
	const channel = current.channel
	if (typeof channel !== 'object' || channel === null || !('id' in channel))
		return
	return typeof channel.id === 'string' ? channel.id : undefined
}

const maxBytes = 25 * 1024 * 1024
type CachedGif = MediaFormat & { uri: string }
const cachedFiles = new Map<string, CachedGif>()

async function downloadMedia(
	gif: Gif,
	signal: AbortSignal,
): Promise<{ bytes: Uint8Array; format: MediaFormat }> {
	let unavailable = false
	for (const url of gifCandidates(gif)) {
		let response: Response
		try {
			response = await fetch(url, { signal })
		} catch (error) {
			if (signal.aborted) throw error
			continue
		}
		if (
			[403, 404].includes(response.status) &&
			/^https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i.test(
				url,
			)
		) {
			const [utils] = lookupModule(
				withProps<{
					maybeRefreshAttachmentUrl(url: string): Promise<unknown>
				}>('maybeRefreshAttachmentUrl'),
			)
			if (utils) {
				try {
					const refreshed = await utils.maybeRefreshAttachmentUrl(url)
					if (signal.aborted) throw new Error('GIF download cancelled.')
					if (
						typeof refreshed === 'string' &&
						refreshed !== url &&
						/^https?:\/\//i.test(refreshed)
					)
						response = await fetch(refreshed, { signal })
				} catch (error) {
					if (signal.aborted) throw error
				}
			}
		}
		if (!response.ok) {
			unavailable ||= [403, 404].includes(response.status)
			continue
		}
		if (Number(response.headers.get('content-length')) > maxBytes)
			throw new Error(
				'This GIF is too large to download. Use URL mode instead.',
			)
		const bytes = new Uint8Array(await response.arrayBuffer())
		if (bytes.length > maxBytes)
			throw new Error(
				'This GIF is too large to download. Use URL mode instead.',
			)
		const format = detectMedia(bytes)
		if (format) return { bytes, format }
	}
	if (unavailable)
		throw new Error(
			'The GIF link expired or is unavailable. Open the original message and favorite the GIF again.',
		)
	throw new Error(
		'No supported image or video was available for this selection. Use URL mode instead.',
	)
}

export async function attachGif({
	gif,
	channelId,
	signal,
	isCurrent,
}: {
	gif: Gif
	channelId: string
	signal: AbortSignal
	isCurrent: () => boolean
}): Promise<void> {
	const cacheKey = gifCandidates(gif).join('\n')
	const cached = cachedFiles.get(cacheKey)
	if (
		cached &&
		(await FileModule.fileExists(cached.uri.replace(/^file:\/\//, '')))
	) {
		if (!signal.aborted && isCurrent()) queueAttachment(channelId, cached)
		return
	}
	cachedFiles.delete(cacheKey)
	const { bytes, format } = await downloadMedia(gif, signal)
	if (signal.aborted || !isCurrent()) return
	const chunks: string[] = []
	for (let offset = 0; offset < bytes.length; offset += 8190)
		chunks.push(
			btoa(String.fromCharCode(...bytes.subarray(offset, offset + 8190))),
		)
	const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
	const path = `gif-text/${id}.${format.extension}`
	const filePath = await FileModule.writeFile(
		'cache',
		path,
		chunks.join(''),
		'base64',
	)
	let queued = false
	try {
		if (signal.aborted || !isCurrent()) return
		if (!filePath) throw new Error('Could not save the GIF attachment.')
		const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`
		const file = {
			uri,
			...format,
		}
		queueAttachment(channelId, file)
		cachedFiles.set(cacheKey, file)
		if (cachedFiles.size > 20) {
			const oldest = cachedFiles.keys().next().value
			if (oldest !== undefined) cachedFiles.delete(oldest)
		}
		// Keep queued files in cache so unsent drafts can still upload them later.
		queued = true
	} finally {
		if (!queued) await FileModule.removeFile('cache', path)
	}
}

function queueAttachment(channelId: string, file: CachedGif) {
	const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
	const { extension, ...attachment } = file
	Dispatcher.dispatch({
		type: 'UPLOAD_ATTACHMENT_ADD_FILES',
		channelId,
		draftType: 0,
		allowOptimization: false,
		files: [
			{
				id,
				...attachment,
				originalUri: file.uri,
				filename: `media-${id}.${extension}`,
				// Discord 351: REACT_NATIVE = 0, IMAGE_PICKER = 1.
				platform: 0,
				origin: 1,
			},
		],
	})
}
