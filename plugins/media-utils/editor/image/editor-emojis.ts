import { Stores } from '@valenced/discord/flux'
import type { DiscordModules } from '@valenced/discord/types'

type Emoji = { id: string; name: string }
type Guilds = { getGuilds(): unknown }
type Emojis = { getGuildEmoji(id: string): unknown }
export function getEditorEmojis() {
	const guilds = Stores.GuildStore as DiscordModules.Flux.Store<Guilds>
	const store = Stores.EmojiStore as DiscordModules.Flux.Store<Emojis>
	const all = guilds?.getGuilds()
	const groups: { id: string; name: string; emojis: Emoji[] }[] = []
	const seen = new Set<string>()
	if (all && typeof all === 'object' && store) {
		for (const [guildId, guild] of Object.entries(all)) {
			const emojis: Emoji[] = []
			const name =
				typeof guild === 'object' &&
				guild !== null &&
				'name' in guild &&
				typeof guild.name === 'string'
					? guild.name
					: 'Server emoji'
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
				if (seen.size >= 2000) break
			}
			if (emojis.length) groups.push({ id: guildId, name, emojis })
			if (seen.size >= 2000) break
		}
	}
	return groups
}
