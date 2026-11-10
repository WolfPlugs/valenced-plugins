import type { NotificationAuthor } from './types'

export interface Message {
	id: string
	channel_id: string
	guild_id?: string
	author?: NotificationAuthor
	content?: string
	type?: number
	mentions?: { id: string }[]
	mention_roles?: string[]
	mentionRoles?: string[]
	referenced_message?: Message | null
	message_reference?: { message_id?: string; channel_id?: string }
	messageReference?: {
		message_id?: string
		channel_id?: string
		messageId?: string
		channelId?: string
	}
}
export interface Channel {
	id: string
	guild_id?: string
	name?: string
	isGroupDM?(): boolean
}
export interface InboxStores {
	UserStore?: {
		addChangeListener(listener: () => void): void
		removeChangeListener(listener: () => void): void
		getCurrentUser(): NotificationAuthor | undefined
		getUser(id: string): NotificationAuthor | undefined
	}
	ChannelStore?: { getChannel(id: string): Channel | undefined }
	GuildStore?: {
		getGuild(id: string): { id: string; name: string } | undefined
	}
	MessageStore?: {
		getMessage(channelId: string, messageId: string): Message | undefined
	}
	GuildMemberStore?: {
		getMember(guildId: string, userId: string): { roles: string[] } | undefined
	}
	RelationshipStore?: { getFriendIDs(): string[] }
}
export interface EventPayload {
	message?: Message
	id?: string
	channel_id?: string
	channelId?: string
	message_id?: string
	messageId?: string
	user_id?: string
	userId?: string
	guildId?: string
	guild_id?: string
	user?: NotificationAuthor
	member?: { user?: NotificationAuthor; nick?: string }
	emoji?: { id?: string; name?: string }
	relationship?: { id: string; type: number; user?: NotificationAuthor }
	addedMembers?: { userId?: string; user_id?: string }[]
	added_members?: { userId?: string; user_id?: string }[]
	activities?: { type: number; state?: string; emoji?: { name?: string } }[]
	updates?: EventPayload[]
}
