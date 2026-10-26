import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'

type Emoji = { id: string; name: string }
type Guilds = { getGuilds(): unknown }
type Emojis = { getGuildEmoji(id: string): unknown }
export function getEditorEmojis() {
	const [guilds] = lookupModule(withProps<Guilds>('getGuilds'))
	const [store] = lookupModule(withProps<Emojis>('getGuildEmoji'))
	const all = guilds?.getGuilds()
	const emojis: Emoji[] = []
	const seen = new Set<string>()
	if (all && typeof all === 'object' && store) {
		for (const guildId of Object.keys(all)) {
			const found = store.getGuildEmoji(guildId)
			if (!Array.isArray(found)) continue
			for (const item of found) {
				if (
					typeof item !== 'object' ||
					item === null ||
					typeof item.id !== 'string' ||
					typeof item.name !== 'string' ||
					!/^\d+$/.test(item.id) ||
					seen.has(item.id)
				)
					continue
				seen.add(item.id)
				emojis.push({ id: item.id, name: item.name })
				if (emojis.length >= 2000) break
			}
			if (emojis.length >= 2000) break
		}
	}
	return emojis
}

export async function prepareNativeEditor() {
	const emojis = getEditorEmojis()
	const configure = callNativeMethod as (
		name: string,
		args: unknown[],
	) => Promise<unknown>
	await configure('wolfie.media-utils.emojis', [emojis])
}
