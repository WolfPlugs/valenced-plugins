import { location, snapshotAuthor } from './tracking/shared'
import type { InboxStores } from './discordTypes'
import type {
	BetterInboxStorage,
	NotificationAuthor,
	NotificationItem,
} from './types'

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: undefined
}
function text(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}
function author(
	value: unknown,
	stores: InboxStores,
): NotificationAuthor | undefined {
	const raw = record(value)
	const id = text(value) ?? text(raw?.id)
	if (!id) return
	const user = stores.UserStore?.getUser(id)
	if (user) return snapshotAuthor(user)
	const username =
		text(raw?.username) ?? text(raw?.global_name) ?? 'Unknown user'
	return {
		id,
		username,
		globalName: text(raw?.global_name) ?? text(raw?.globalName),
		avatar: text(raw?.avatar),
	}
}
export function historyTime(value: unknown, id?: string): number {
	const date =
		typeof value === 'string' ||
		typeof value === 'number' ||
		value instanceof Date
			? new Date(value).getTime()
			: NaN
	if (Number.isFinite(date)) return date
	if (id && /^\d+$/.test(id)) return Number(BigInt(id) >> 22n) + 1420070400000
	return 0
}
function displayTime(createdAt: number) {
	return createdAt
		? new Date(createdAt).toLocaleString([], {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			})
		: ''
}
function isHistoricalReply(
	message: Record<string, unknown> | undefined,
	stores: InboxStores,
): boolean {
	const me = stores.UserStore?.getCurrentUser()?.id
	if (!message || !me) return false
	const referenced = record(
		message.referenced_message ?? message.referencedMessage,
	)
	const referencedAuthor = record(referenced?.author)
	if (typeof referencedAuthor?.id === 'string')
		return referencedAuthor.id === me
	const reference = record(
		message.message_reference ?? message.messageReference,
	)
	const messageId = text(reference?.message_id) ?? text(reference?.messageId)
	const channelId =
		text(reference?.channel_id) ??
		text(reference?.channelId) ??
		text(message.channel_id)
	return Boolean(
		messageId &&
			channelId &&
			stores.MessageStore?.getMessage(channelId, messageId)?.author?.id === me,
	)
}
export function importNativeItem(
	value: unknown,
	stores: InboxStores,
	settings: BetterInboxStorage = {},
): NotificationItem | undefined {
	const raw = record(value)
	if (!raw) return
	const type = text(raw.type) ?? ''
	const message = record(raw.message)
	const messageId = text(message?.id) ?? text(raw.message_id)
	const channelId = text(message?.channel_id) ?? text(raw.channel_id)
	const user = author(raw.other_user ?? raw.user ?? message?.author, stores)
	const incoming =
		type === 'INCOMING_FRIEND_REQUESTS' ||
		type === 'friend_request_pending' ||
		type === 'friend_request_reminder'
	const accepted =
		type === 'INCOMING_FRIEND_REQUESTS_ACCEPTED' ||
		type === 'friend_request_accepted'
	const reply =
		type === 'reply_mention' ||
		(type === 'recent_mention' && isHistoricalReply(message, stores))
	const mention = type === 'recent_mention' || reply
	const reaction = type === 'reaction_sent'
	if ((incoming || accepted) && settings.trackFriendRequests === false) return
	if (
		mention &&
		(reply ? settings.trackReplies === false : settings.trackMentions === false)
	)
		return
	if (reaction && settings.trackReactions === false) return
	const rawId = text(raw.id) ?? text(raw.local_id)
	const id =
		incoming && user
			? `friend-request-${user.id}`
			: mention && channelId && messageId
				? `mention-${channelId}-${messageId}`
				: rawId
					? `native-${rawId}`
					: undefined
	if (!id) return
	const createdAt = historyTime(
		raw.timestamp ?? raw.created_at ?? raw.since ?? message?.timestamp,
		rawId && /^\d+$/.test(rawId) ? rawId : messageId,
	)
	const guildId =
		text(raw.guild_id) ??
		text(message?.guild_id) ??
		(channelId
			? stores.ChannelStore?.getChannel(channelId)?.guild_id
			: undefined)
	const ownRoles = guildId
		? (stores.GuildMemberStore?.getMember(
				guildId,
				stores.UserStore?.getCurrentUser()?.id ?? '',
			)?.roles ?? [])
		: []
	const mentionedRoles = message?.mention_roles ?? message?.mentionRoles
	const roleMention =
		Array.isArray(mentionedRoles) &&
		mentionedRoles.some(
			role => typeof role === 'string' && ownRoles.includes(role),
		)
	const category =
		incoming || accepted
			? 'friend_request'
			: mention
				? reply
					? 'replies'
					: 'mentions'
				: reaction
					? 'reactions'
					: 'other'
	const name = user?.globalName || user?.username || 'Someone'
	const place = channelId
		? location(channelId, stores)
		: { guildName: '', channelName: '' }
	return {
		id,
		category,
		subCategory:
			category === 'mentions'
				? user?.bot
					? 'bot'
					: roleMention
						? 'role'
						: 'people'
				: undefined,
		title: incoming
			? `${name} sent you a friend request`
			: accepted
				? `${name} accepted your friend request`
				: mention
					? `${name} ${reply ? 'replied to' : 'mentioned'} you`
					: reaction
						? `${name} reacted to your message`
						: text(raw.title) || type.replaceAll('_', ' ') || 'Activity',
		content: text(message?.content) ?? text(raw.body) ?? '',
		...place,
		guildId,
		channelId,
		messageId,
		author: user,
		createdAt,
		timestamp: displayTime(createdAt),
	}
}

export interface NativeHistoryStore {
	readonly items?: unknown
	readonly localItems?: unknown
	getMentions?(): unknown
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}
export function readNativeHistory(
	store: NativeHistoryStore,
	stores: InboxStores,
	settings?: BetterInboxStorage,
): NotificationItem[] {
	const items = [store.items, store.localItems]
	const mentions = store.getMentions?.()
	if (Array.isArray(mentions))
		items.push(mentions.map(message => ({ type: 'recent_mention', message })))
	return items.flatMap(values =>
		Array.isArray(values)
			? values.flatMap(value => {
					const item = importNativeItem(value, stores, settings)
					return item ? [item] : []
				})
			: [],
	)
}
