import { describe, expect, test } from 'bun:test'
import {
	importNativeItem,
	readNativeHistory,
} from '../plugins/better-inbox/src/lib/history'
import { createInbox } from '../plugins/better-inbox/src/lib/inbox'
import type { InboxStores } from '../plugins/better-inbox/src/lib/discordTypes'
import type { BetterInboxStorage } from '../plugins/better-inbox/src/lib/types'

const stores: InboxStores = {
	UserStore: {
		getCurrentUser: () => ({ id: 'me', username: 'Me' }),
		getUser: id => ({ id, username: 'Friend' }),
		addChangeListener() {},
		removeChangeListener() {},
	},
	ChannelStore: {
		getChannel: id => ({ id, guild_id: 'guild', name: 'general' }),
	},
	GuildStore: { getGuild: id => ({ id, name: 'Our server' }) },
}
// Native getter/local-item shapes verified against the installed Discord bundle.
const request = {
	id: '1420070400000000000',
	type: 'INCOMING_FRIEND_REQUESTS',
	other_user: { id: 'friend' },
	local_id: 'incoming_friend_requests_friend_1420070400000000000',
}
const mention = {
	id: 'remote-mention',
	type: 'recent_mention',
	message: {
		id: 'message',
		channel_id: 'channel',
		author: { id: 'friend', username: 'Friend' },
		content: 'Hello',
		timestamp: '2026-11-10T12:00:00Z',
	},
}

describe('BetterInbox existing Discord history', () => {
	test('reads existing friend requests and messages without waiting for new gateway events', () => {
		const source = {
			items: [mention],
			localItems: [request],
			addChangeListener() {},
			removeChangeListener() {},
		}
		const items = readNativeHistory(source, stores)
		expect(items.map(item => item.category)).toEqual([
			'mentions',
			'friend_request',
		])
		expect(items[0]).toMatchObject({
			id: 'mention-channel-message',
			content: 'Hello',
			channelId: 'channel',
			guildName: 'Our server',
		})
		expect(items[1]).toMatchObject({
			id: 'friend-request-friend',
			title: 'Friend sent you a friend request',
			author: { id: 'friend' },
		})
	})
	test('recognizes replies, reactions and accepted friend requests in remote history', () => {
		for (const [type, category] of [
			['reply_mention', 'replies'],
			['reaction_sent', 'reactions'],
			['friend_request_accepted', 'friend_request'],
		]) {
			expect(importNativeItem({ ...mention, type }, stores)?.category).toBe(
				category,
			)
		}
	})
	test('imports RecentMentionsStore messages and respects disabled categories', () => {
		const source = {
			getMentions: () => [mention.message],
			addChangeListener() {},
			removeChangeListener() {},
		}
		expect(readNativeHistory(source, stores)[0]?.id).toBe(
			'mention-channel-message',
		)
		expect(readNativeHistory(source, stores, { trackMentions: false })).toEqual(
			[],
		)
		expect(
			importNativeItem(request, stores, { trackFriendRequests: false }),
		).toBeUndefined()
		expect(
			importNativeItem({ ...mention, type: 'reply_mention' }, stores, {
				trackReplies: false,
			}),
		).toBeUndefined()
	})
	test('ignores invalid native records', () => {
		for (const value of [null, {}, { type: 'recent_mention', message: {} }])
			expect(importNativeItem(value, stores)).toBeUndefined()
	})
	test('merges native and live history once, newest first', async () => {
		const inbox = createInbox({
			owner: 'me',
			read: () => ({}),
			save: async () => {},
			reportError: error => {
				throw error
			},
		})
		const native = readNativeHistory(
			{
				items: [mention],
				localItems: [request],
				addChangeListener() {},
				removeChangeListener() {},
			},
			stores,
		)
		inbox.importHistory(native)
		inbox.importHistory(native)
		inbox.push(native[0]!)
		expect(inbox.getSnapshot()).toHaveLength(2)
		expect(inbox.getSnapshot()[0]?.createdAt).toBeGreaterThan(
			inbox.getSnapshot()[1]?.createdAt ?? 0,
		)
		await inbox.stop()
	})
	test('cleared imported entries stay dismissed across source updates and restarts', async () => {
		let saved: BetterInboxStorage = {}
		const inbox = createInbox({
			owner: 'me',
			read: () => saved,
			save: async state => {
				saved = state
			},
			reportError: error => {
				throw error
			},
		})
		const item = importNativeItem(request, stores)!
		inbox.importHistory([item])
		inbox.clear('friend_request')
		inbox.importHistory([item])
		expect(inbox.getSnapshot()).toEqual([])
		await inbox.stop()
		const restarted = createInbox({
			owner: 'me',
			read: () => saved,
			save: async () => {},
			reportError: error => {
				throw error
			},
		})
		restarted.importHistory([item])
		expect(restarted.getSnapshot()).toEqual([])
		restarted.setOwner('other')
		restarted.importHistory([item])
		expect(restarted.getSnapshot()).toHaveLength(1)
		await restarted.stop()
	})
	test('classifies replies from the recent-mentions endpoint using their referenced author', () => {
		const currentStores = {
			...stores,
			UserStore: {
				...stores.UserStore!,
				getCurrentUser: () => ({ id: 'me', username: 'Me' }),
			},
		}
		const value = {
			...mention,
			message: {
				...mention.message,
				referenced_message: { author: { id: 'me' } },
			},
		}
		expect(importNativeItem(value, currentStores)?.category).toBe('replies')
		expect(
			importNativeItem(
				{
					...value,
					message: {
						...value.message,
						referenced_message: { author: { id: 'someone-else' } },
					},
				},
				currentStores,
			)?.category,
		).toBe('mentions')
	})

	test('refresh corrects previously saved mention classifications without duplicating entries', async () => {
		const inbox = createInbox({
			owner: 'me',
			read: () => ({}),
			save: async () => {},
			reportError: error => {
				throw error
			},
		})
		const item = importNativeItem(mention, stores)!
		inbox.importHistory([item])
		inbox.importHistory([{ ...item, category: 'replies' }])
		expect(inbox.getSnapshot()).toHaveLength(1)
		expect(inbox.getSnapshot()[0]?.category).toBe('replies')
		inbox.importHistory([item])
		expect(inbox.getSnapshot()[0]?.category).toBe('replies')
		await inbox.stop()
	})
})
