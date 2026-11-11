import { base64 } from '../../file-previews/download'

const maxEmojiBytes = 1024 * 1024

export async function loadEmojiImage(id: string) {
	if (!/^\d{1,20}$/.test(id)) throw new Error('Invalid Discord emoji ID.')
	const response = await fetch(
		`https://cdn.discordapp.com/emojis/${id}.png?size=256`,
	)
	if (!response.ok)
		throw new Error(`Could not download the emoji (HTTP ${response.status}).`)
	if (Number(response.headers.get('content-length')) > maxEmojiBytes)
		throw new Error('This emoji image is too large.')
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (!bytes.length || bytes.length > maxEmojiBytes)
		throw new Error('The emoji image is empty or too large.')
	return `data:image/png;base64,${base64(bytes)}`
}
