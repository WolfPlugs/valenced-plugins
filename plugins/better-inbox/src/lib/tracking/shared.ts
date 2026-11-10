import type { InboxStores } from '../discordTypes'
import type {
	BetterInboxStorage,
	NotificationAuthor,
	NotificationItem,
} from '../types'

export interface EventContext {
	stores(): InboxStores
	getSettings(): BetterInboxStorage | undefined
	pushNotification(item: NotificationItem): void
	reportError(error: unknown): void
}
export function snapshotAuthor(author: NotificationAuthor): NotificationAuthor {
	return {
		id: author.id,
		username: author.username,
		globalName:
			typeof author.globalName === 'string' ? author.globalName : undefined,
		avatar: author.avatar,
		discriminator:
			typeof author.discriminator === 'string'
				? author.discriminator
				: undefined,
		bot: author.bot === true,
	}
}
export function timestamp() {
	return new Date().toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	})
}
export function location(channelId: string, stores: InboxStores) {
	const channel = stores.ChannelStore?.getChannel(channelId)
	const guildId = channel?.guild_id
	return {
		channelId,
		guildId,
		guildName:
			(guildId ? stores.GuildStore?.getGuild(guildId)?.name : undefined) ??
			(channel?.isGroupDM?.() ? 'Group DM' : 'Direct Message'),
		channelName: channel?.name ? `#${channel.name}` : 'DM',
	}
}
