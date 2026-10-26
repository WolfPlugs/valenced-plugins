export type Gif = { url: string; gifSrc?: unknown; src?: unknown }

function fileUrl(value: string): string | undefined {
	let url: URL
	try {
		url = new URL(value)
	} catch {
		return
	}
	const host = url.hostname.toLowerCase()
	if (
		(host === 'tenor.com' || host === 'www.tenor.com') &&
		url.pathname.startsWith('/view/')
	) {
		if (!url.pathname.endsWith('.gif')) url.pathname += '.gif'
		return url.toString()
	}
	if (
		(host === 'giphy.com' || host === 'www.giphy.com') &&
		/^\/(?:gifs|clips)\//.test(url.pathname)
	) {
		const id = url.pathname.split('/').filter(Boolean).pop()?.split('-').pop()
		if (id && /^[a-zA-Z0-9]+$/.test(id))
			return `https://media.giphy.com/media/${id}/giphy.gif`
	}
	if (host === 'media.tenor.com' && /\.(?:mp4|webm)$/i.test(url.pathname)) {
		url.pathname = url.pathname.replace(/\.(?:mp4|webm)$/i, '.gif')
		return url.toString()
	}
}

export function gifCandidates(gif: Gif): string[] {
	const candidates: string[] = []
	for (const value of [gif.gifSrc, gif.src, gif.url]) {
		if (typeof value !== 'string' || !/^https?:\/\/\S+$/i.test(value)) continue
		const normalized = value.replace(/([?&])format=webp\b/i, '$1format=gif')
		const direct = fileUrl(normalized)
		if (direct) candidates.push(direct)
		candidates.push(normalized)
	}
	return [...new Set(candidates)]
}
