import { snapshotAuthor, timestamp } from './shared'
import type { EventPayload } from '../discordTypes'
import type { EventContext } from './shared'

export function createSocialHandlers({
	stores,
	getSettings,
	pushNotification,
}: EventContext) {
	function request(payload: EventPayload) {
		if (getSettings()?.trackFriendRequests === false) return
		const relationship = payload.relationship
		if (relationship?.type !== 3 || !relationship.user) return
		const user = relationship.user
		pushNotification({
			id: `friend-request-${relationship.id}`,
			category: 'friend_request',
			title: `${user.globalName || user.username} sent you a friend request`,
			content: '',
			guildName: '',
			channelName: '',
			createdAt: Date.now(),
			timestamp: timestamp(),
			author: snapshotAuthor(user),
		})
	}
	function accepted(payload: EventPayload) {
		if (getSettings()?.trackFriendRequests === false || !payload.user) return
		const user = payload.user
		pushNotification({
			id: `friend-accepted-${user.id}-${Date.now()}`,
			category: 'friend_request',
			title: `${user.globalName || user.username} accepted your friend request`,
			content: '',
			guildName: '',
			channelName: '',
			createdAt: Date.now(),
			timestamp: timestamp(),
			author: snapshotAuthor(user),
		})
	}
	function thread(payload: EventPayload) {
		if (getSettings()?.trackThreads === false || !payload.id) return
		const current = stores()
		const me = current.UserStore?.getCurrentUser()
		const added = payload.addedMembers ?? payload.added_members
		if (
			!me ||
			!added?.some(member => (member.userId ?? member.user_id) === me.id)
		)
			return
		const channel = current.ChannelStore?.getChannel(payload.id)
		if (!channel) return
		const guildId = payload.guildId ?? payload.guild_id ?? channel.guild_id
		pushNotification({
			id: `thread-added-${payload.id}`,
			category: 'thread',
			title: 'You were added to a thread',
			content: channel.name ? `#${channel.name}` : '',
			channelName: channel.name ? `#${channel.name}` : '',
			guildName:
				(guildId ? current.GuildStore?.getGuild(guildId)?.name : undefined) ??
				'',
			guildId,
			channelId: payload.id,
			createdAt: Date.now(),
			timestamp: timestamp(),
		})
	}
	return {
		RELATIONSHIP_ADD: request,
		FRIEND_REQUEST_ACCEPTED: accepted,
		THREAD_MEMBERS_UPDATE: thread,
	}
}
