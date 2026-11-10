import { expect, test } from 'bun:test'
import { createInbox } from '../plugins/better-inbox/src/lib/inbox'
import type {
	BetterInboxStorage,
	NotificationCategory,
	NotificationItem,
} from '../plugins/better-inbox/src/lib/types'

function item(
	category: NotificationCategory,
	index: number,
	createdAt: number,
): NotificationItem {
	return {
		id: `${category}-${index}`,
		category,
		title: String(index),
		content: '',
		guildName: '',
		channelName: '',
		timestamp: '',
		createdAt,
	}
}

test('a full message history does not reduce Friends to one request, including after restart', async () => {
	let saved: BetterInboxStorage = { owner: 'me', maxStored: 300 }
	const inbox = createInbox({
		owner: 'me',
		read: () => saved,
		save: async state => {
			saved = { ...saved, ...JSON.parse(JSON.stringify(state)) }
		},
		reportError: error => {
			throw error
		},
	})
	const requests = Array.from({ length: 20 }, (_, index) =>
		item('friend_request', index, index),
	)
	inbox.importHistory(requests)
	// Previously, 266 mentions + 33 replies + a recent request evicted all 20 older requests.
	inbox.importHistory([
		...Array.from({ length: 266 }, (_, index) =>
			item('mentions', index, 1000 + index),
		),
		...Array.from({ length: 33 }, (_, index) =>
			item('replies', index, 2000 + index),
		),
		item('friend_request', 20, 3000),
	])
	expect(
		inbox.getSnapshot().filter(value => value.category === 'friend_request'),
	).toHaveLength(21)
	await inbox.stop()
	const restarted = createInbox({
		owner: undefined,
		read: () => saved,
		save: async () => {},
		reportError: error => {
			throw error
		},
	})
	restarted.setOwner('me')
	expect(
		restarted
			.getSnapshot()
			.filter(value => value.category === 'friend_request'),
	).toHaveLength(21)
	await restarted.stop()
})

test('live messages and paginated history respect each category limit without evicting other categories', async () => {
	const inbox = createInbox({
		owner: 'me',
		read: () => ({ maxStored: 2 }),
		save: async () => {},
		reportError: error => {
			throw error
		},
	})
	inbox.importHistory([
		item('friend_request', 0, 1),
		item('friend_request', 1, 2),
	])
	inbox.importHistory(
		Array.from({ length: 5 }, (_, index) =>
			item('mentions', index, index + 10),
		),
	)
	inbox.push(item('mentions', 5, 20))
	expect(
		inbox
			.getSnapshot()
			.filter(value => value.category === 'mentions')
			.map(value => value.id),
	).toEqual(['mentions-5', 'mentions-4'])
	expect(
		inbox.getSnapshot().filter(value => value.category === 'friend_request'),
	).toHaveLength(2)
	inbox.clear('friend_request')
	inbox.importHistory([
		item('friend_request', 0, 1),
		item('friend_request', 1, 2),
	])
	expect(
		inbox.getSnapshot().filter(value => value.category === 'friend_request'),
	).toHaveLength(0)
	expect(
		inbox.getSnapshot().filter(value => value.category === 'mentions'),
	).toHaveLength(2)
	await inbox.stop()
})
