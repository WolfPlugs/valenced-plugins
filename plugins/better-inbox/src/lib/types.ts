export type NotificationCategory =
	| 'mentions'
	| 'replies'
	| 'reactions'
	| 'friend_request'
	| 'thread'
	| 'other'

export type MentionSubCategory = 'all' | 'people' | 'role' | 'bot'

export interface NotificationAuthor {
	id: string
	username: string
	globalName?: string
	avatar?: string | null
	discriminator?: string
	bot?: boolean
}

export interface NotificationItem {
	id: string
	category: NotificationCategory
	subCategory?: Exclude<MentionSubCategory, 'all'>
	title: string
	content: string
	guildName: string
	channelName: string
	guildId?: string
	channelId?: string
	messageId?: string
	createdAt?: number
	timestamp: string
	author?: NotificationAuthor
}

export interface BetterInboxStorage {
	owner?: string
	dismissed?: string[]

	showYouBarButton?: boolean
	notifications?: NotificationItem[]
	maxStored?: number
	blockSystemNotifications?: boolean
	trackMentions?: boolean
	trackReplies?: boolean
	trackReactions?: boolean
	trackFriendRequests?: boolean
	trackThreads?: boolean
	trackPresence?: boolean
}

export const DEFAULT_STORAGE: BetterInboxStorage = {
	showYouBarButton: true,
	notifications: [],
	maxStored: 300,
	blockSystemNotifications: false,
	trackMentions: true,
	trackReplies: true,
	trackReactions: true,
	trackFriendRequests: true,
	trackThreads: true,
	trackPresence: false,
}
