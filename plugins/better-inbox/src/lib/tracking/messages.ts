import { location, snapshotAuthor, timestamp } from './shared'
import type { EventPayload, InboxStores, Message } from '../discordTypes'
import type { EventContext } from './shared'

export function isReplyToUser(
	message: Message,
	userId: string,
	stores: InboxStores,
): boolean {
	const reference = message.message_reference
	const messageId =
		reference?.message_id ??
		message.messageReference?.messageId ??
		message.messageReference?.message_id
	const channelId =
		reference?.channel_id ??
		message.messageReference?.channelId ??
		message.messageReference?.channel_id
	const referenced =
		message.referenced_message ??
		(messageId
			? stores.MessageStore?.getMessage(
					channelId ?? message.channel_id,
					messageId,
				)
			: undefined)
	return referenced?.author?.id === userId
}
export function createMessageHandlers({
	stores,
	getSettings,
	pushNotification,
}: EventContext) {
	function message(payload: EventPayload) {
		const current = stores()
		const me = current.UserStore?.getCurrentUser()
		const msg = payload.message
		if (
			!me ||
			!msg?.id ||
			!msg.channel_id ||
			!msg.author ||
			msg.author.id === me.id
		)
			return
		const place = location(msg.channel_id, current)
		const guildId = msg.guild_id ?? place.guildId
		const roles = guildId
			? (current.GuildMemberStore?.getMember(guildId, me.id)?.roles ?? [])
			: []
		const roleMention = (msg.mention_roles ?? msg.mentionRoles ?? []).some(
			role => roles.includes(role),
		)
		const directMention = msg.mentions?.some(user => user.id === me.id)
		const reply = isReplyToUser(msg, me.id, current)
		const settings = getSettings()
		if (
			reply
				? settings?.trackReplies === false
				: settings?.trackMentions === false
		)
			return
		if (!reply && !directMention && !roleMention) return
		pushNotification({
			id: `mention-${msg.channel_id}-${msg.id}`,
			category: reply ? 'replies' : 'mentions',
			subCategory: reply
				? undefined
				: msg.author.bot
					? 'bot'
					: roleMention
						? 'role'
						: 'people',
			title: `${msg.author.globalName || msg.author.username} ${reply ? 'replied to' : 'mentioned'} you`,
			content: msg.content || '',
			...place,
			messageId: msg.id,
			createdAt: Date.now(),
			timestamp: timestamp(),
			author: snapshotAuthor(msg.author),
		})
	}
	function reaction(payload: EventPayload) {
		if (getSettings()?.trackReactions === false) return
		const current = stores()
		const me = current.UserStore?.getCurrentUser()
		const channelId = payload.channel_id ?? payload.channelId
		const messageId = payload.message_id ?? payload.messageId
		const userId = payload.user_id ?? payload.userId
		if (!me || !channelId || !messageId || !userId || userId === me.id) return
		const target = current.MessageStore?.getMessage(channelId, messageId)
		if (target?.author?.id !== me.id) return
		const author = payload.member?.user ??
			payload.user ??
			current.UserStore?.getUser(userId) ?? {
				id: userId,
				username: payload.member?.nick || 'Someone',
			}
		const place = location(channelId, current)
		pushNotification({
			id: `react-${channelId}-${messageId}-${userId}-${payload.emoji?.id || payload.emoji?.name || 'unknown'}`,
			category: 'reactions',
			title: `${author.globalName || author.username} reacted ${payload.emoji?.name || 'an emoji'}`,
			content: target.content
				? `"${target.content}"`
				: `Reacted to your message in ${place.channelName}`,
			...place,
			messageId,
			createdAt: Date.now(),
			timestamp: timestamp(),
			author: snapshotAuthor(author),
		})
	}
	return { MESSAGE_CREATE: message, MESSAGE_REACTION_ADD: reaction }
}
