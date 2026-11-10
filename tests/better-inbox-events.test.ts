import { describe, expect, test } from 'bun:test'
import { createEventHandlers } from '../plugins/better-inbox/src/lib/events'
import type {
	InboxStores,
	Message,
} from '../plugins/better-inbox/src/lib/discordTypes'
import type {
	BetterInboxStorage,
	NotificationItem,
} from '../plugins/better-inbox/src/lib/types'

function setup(settings: BetterInboxStorage = {}) {
	const items: NotificationItem[] = []
	const errors: unknown[] = []
	const mine: Message = {
		id: 'mine',
		channel_id: 'channel',
		author: { id: 'me', username: 'Me' },
		content: 'My message',
	}
	const stores: InboxStores = {
		UserStore: {
			getCurrentUser: () => ({ id: 'me', username: 'Me' }),
			getUser: id => ({ id, username: id }),
			addChangeListener() {},
			removeChangeListener() {},
		},
		ChannelStore: {
			getChannel: id => ({ id, guild_id: 'guild', name: 'chat' }),
		},
		GuildStore: { getGuild: id => ({ id, name: 'Our server' }) },
		MessageStore: {
			getMessage: (_channel, id) => (id === 'mine' ? mine : undefined),
		},
		GuildMemberStore: { getMember: () => ({ roles: ['my-role'] }) },
		RelationshipStore: { getFriendIDs: () => ['friend'] },
	}
	const handlers = createEventHandlers({
		stores: () => stores,
		getSettings: () => settings,
		pushNotification: item => items.push(item),
		reportError: error => errors.push(error),
	})
	const message: Message = {
		id: 'incoming',
		channel_id: 'channel',
		author: { id: 'friend', username: 'Friend' },
		content: 'Hello',
		mentions: [{ id: 'me' }],
	}
	return { ...handlers, items, errors, message, stores }
}

describe('BetterInbox event tracking', () => {
	test('a reply to somebody else that mentions me stays in Mentions', () => {
		const { events, items, message } = setup()
		events.MESSAGE_CREATE({
			message: {
				...message,
				type: 19,
				referenced_message: {
					...message,
					author: { id: 'other', username: 'Other' },
				},
			},
		})
		expect(items[0]?.category).toBe('mentions')
	})
	test('resolves cached reply references and honors the reply toggle', () => {
		for (const enabled of [true, false]) {
			const { events, items, message } = setup({ trackReplies: enabled })
			events.MESSAGE_CREATE({
				message: {
					...message,
					mentions: [],
					message_reference: { message_id: 'mine' },
				},
			})
			expect(items.map(item => item.category)).toEqual(
				enabled ? ['replies'] : [],
			)
		}
	})
	test('role mentions use the channel guild and only match roles belonging to me', () => {
		const { events, items, message } = setup()
		events.MESSAGE_CREATE({
			message: { ...message, mentions: [], mention_roles: ['not-my-role'] },
		})
		expect(items).toHaveLength(0)
		events.MESSAGE_CREATE({
			message: { ...message, mentions: [], mention_roles: ['my-role'] },
		})
		expect(items[0]?.subCategory).toBe('role')
	})
	test('a direct mention alongside an unrelated role is classified as people', () => {
		const { events, items, message } = setup()
		events.MESSAGE_CREATE({
			message: { ...message, mention_roles: ['not-my-role'] },
		})
		expect(items[0]?.subCategory).toBe('people')
	})
	test('bot mentions stay separate and persisted authors are plain snapshots', () => {
		const { events, items, message } = setup()
		events.MESSAGE_CREATE({
			message: {
				...message,
				author: {
					...message.author!,
					bot: true,
					toJSON() {
						throw new Error('Never serialize a Discord model')
					},
				},
			},
		})
		expect(items[0]?.subCategory).toBe('bot')
		expect(() => JSON.stringify(items)).not.toThrow()
	})
	test('ignores own messages, unrelated messages, disabled mentions and incomplete events', () => {
		const { events, items, message } = setup({ trackMentions: false })
		events.MESSAGE_CREATE({ message })
		events.MESSAGE_CREATE({
			message: { ...message, author: { id: 'me', username: 'Me' } },
		})
		events.MESSAGE_CREATE({})
		expect(items).toEqual([])
	})
	test('different emoji reactions produce distinct IDs and own reactions are ignored', () => {
		const { events, items } = setup()
		for (const name of ['heart', 'smile'])
			events.MESSAGE_REACTION_ADD({
				channel_id: 'channel',
				message_id: 'mine',
				user_id: 'friend',
				emoji: { name },
			})
		events.MESSAGE_REACTION_ADD({
			channel_id: 'channel',
			message_id: 'mine',
			user_id: 'me',
			emoji: { name: 'heart' },
		})
		expect(items).toHaveLength(2)
		expect(new Set(items.map(item => item.id)).size).toBe(2)
	})
	test('only tracks reactions to cached own messages and honors the setting', () => {
		for (const enabled of [true, false]) {
			const { events, items } = setup({ trackReactions: enabled })
			events.MESSAGE_REACTION_ADD({
				channelId: 'channel',
				messageId: 'missing',
				userId: 'friend',
			})
			events.MESSAGE_REACTION_ADD({})
			expect(items).toHaveLength(0)
			events.MESSAGE_REACTION_ADD({
				channelId: 'channel',
				messageId: 'mine',
				userId: 'friend',
			})
			expect(items).toHaveLength(enabled ? 1 : 0)
		}
	})
	test('tracks incoming requests, accepted requests and thread additions', () => {
		const { events, items } = setup()
		const user = { id: 'friend', username: 'Friend' }
		events.RELATIONSHIP_ADD({ relationship: { id: user.id, type: 1, user } })
		expect(items).toHaveLength(0)
		events.RELATIONSHIP_ADD({ relationship: { id: user.id, type: 3, user } })
		events.FRIEND_REQUEST_ACCEPTED({ user })
		events.THREAD_MEMBERS_UPDATE({
			id: 'thread',
			added_members: [{ user_id: 'me' }],
		})
		expect(items.map(item => item.category)).toEqual([
			'friend_request',
			'friend_request',
			'thread',
		])
	})
	test('disabled social categories do not create entries', () => {
		const { events, items } = setup({
			trackFriendRequests: false,
			trackThreads: false,
		})
		const user = { id: 'friend', username: 'Friend' }
		events.RELATIONSHIP_ADD({ relationship: { id: user.id, type: 3, user } })
		events.FRIEND_REQUEST_ACCEPTED({ user })
		events.THREAD_MEMBERS_UPDATE({
			id: 'thread',
			addedMembers: [{ userId: 'me' }],
		})
		expect(items).toEqual([])
	})
	test('status deduplication includes emoji changes and resets on account changes', () => {
		const { events, items, reset } = setup({ trackPresence: true })
		const user = { id: 'friend', username: 'Friend' }
		const updates = (emoji: string) => ({
			updates: [
				{
					user,
					activities: [{ type: 4, state: 'Working', emoji: { name: emoji } }],
				},
			],
		})
		events.PRESENCE_UPDATES(updates('coffee'))
		events.PRESENCE_UPDATES(updates('coffee'))
		events.PRESENCE_UPDATES(updates('tea'))
		expect(items).toHaveLength(2)
		expect(new Set(items.map(item => item.id)).size).toBe(2)
		reset()
		events.PRESENCE_UPDATES(updates('tea'))
		expect(items).toHaveLength(3)
	})
	test('status tracking is opt-in and limited to non-bot friends', () => {
		for (const enabled of [true, false]) {
			const { events, items } = setup({ trackPresence: enabled })
			for (const user of [
				{ id: 'stranger', username: 'Stranger' },
				{ id: 'friend', username: 'Bot', bot: true },
			]) {
				events.PRESENCE_UPDATES({
					updates: [{ user, activities: [{ type: 4, state: 'Hello' }] }],
				})
			}
			expect(items).toEqual([])
		}
	})
})
