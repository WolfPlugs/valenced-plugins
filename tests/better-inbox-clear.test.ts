import { expect, test } from 'bun:test'
import { importNativeItem } from '../plugins/better-inbox/src/lib/history'
import { createInbox } from '../plugins/better-inbox/src/lib/inbox'
import type { InboxStores } from '../plugins/better-inbox/src/lib/discordTypes'
import type {
	BetterInboxStorage,
	NotificationItem,
} from '../plugins/better-inbox/src/lib/types'

function item(id: string): NotificationItem {
	return {
		id,
		category: 'friend_request',
		title: id,
		content: '',
		guildName: '',
		channelName: '',
		timestamp: '',
		createdAt: 100,
	}
}
function create(saved: BetterInboxStorage, owner: string | null = 'me') {
	const writes: BetterInboxStorage[] = []
	const inbox = createInbox({
		owner: owner ?? undefined,
		read: () => saved,
		save: async value => {
			writes.push(JSON.parse(JSON.stringify(value)))
		},
		reportError: error => {
			throw error
		},
	})
	return { inbox, writes }
}

test('keeps every request with nullable Discord author fields after a JSON save and restart', async () => {
	const original = {
		owner: 'me',
		notifications: ['one', 'two', 'three'].map(id => ({
			...item(id),
			author: {
				id,
				username: id,
				globalName: null,
				discriminator: null,
				bot: null,
			},
		})),
	}
	const { inbox, writes } = create(original)
	expect(inbox.getSnapshot()).toHaveLength(3)
	inbox.importHistory([item('four')])
	await inbox.stop()
	const { inbox: restarted } = create(writes.at(-1)!)
	expect(restarted.getSnapshot()).toHaveLength(4)
	await restarted.stop()
})

test('waits for the first confirmed account before restoring history and dismissal state', async () => {
	const saved: BetterInboxStorage = {
		owner: 'me',
		notifications: [item('one'), item('two'), item('three')],
		dismissed: ['dismissed'],
		clearedAt: { mentions: 1000 },
	}
	const { inbox } = create(saved, null)
	expect(inbox.getSnapshot()).toEqual([])
	inbox.setOwner('me')
	expect(inbox.getSnapshot()).toHaveLength(3)
	inbox.importHistory([
		item('dismissed'),
		{ ...item('old-mention'), category: 'mentions' },
	])
	expect(inbox.getSnapshot()).toHaveLength(3)
	await inbox.stop()
	const { inbox: other } = create(saved, null)
	other.setOwner('someone-else')
	expect(other.getSnapshot()).toEqual([])
	await other.stop()
})

test('uses the same request ID before and after user-cache hydration and native ID changes', async () => {
	const stores: InboxStores = {
		UserStore: {
			getCurrentUser: () => ({ id: 'me', username: 'Me' }),
			getUser: () => undefined,
			addChangeListener() {},
			removeChangeListener() {},
		},
	}
	const cold = importNativeItem(
		{
			type: 'INCOMING_FRIEND_REQUESTS',
			id: 'native-one',
			other_user: { id: 'friend' },
		},
		stores,
	)!
	const warm = importNativeItem(
		{ type: 'friend_request_pending', id: 'native-two', other_user: 'friend' },
		stores,
	)!
	expect(cold.id).toBe('friend-request-friend')
	expect(warm.id).toBe(cold.id)
	const { inbox, writes } = create({ owner: 'me' })
	inbox.importHistory([cold])
	inbox.clear()
	inbox.importHistory([warm])
	expect(inbox.getSnapshot()).toEqual([])
	await inbox.flush()
	const { inbox: restarted } = create(writes.at(-1)!, null)
	restarted.setOwner('me')
	restarted.importHistory([warm])
	expect(restarted.getSnapshot()).toEqual([])
	await Promise.all([inbox.stop(), restarted.stop()])
})

test('clear-all saves immediately and prevents unloaded older history from appearing on refresh', async () => {
	const { inbox, writes } = create({ owner: 'me' })
	inbox.importHistory([item('visible')])
	inbox.clear()
	await Promise.resolve()
	expect(writes).toHaveLength(1)
	expect(writes[0]?.notifications).toEqual([])
	inbox.importHistory([item('visible'), item('not-loaded-before-clear')])
	expect(inbox.getSnapshot()).toEqual([])
	const afterClear = Date.now() + 1000
	inbox.importHistory([{ ...item('new-request'), createdAt: afterClear }])
	expect(inbox.getSnapshot().map(value => value.id)).toEqual(['new-request'])
	await inbox.stop()
})

test('clearing one category preserves the others and its cutoff survives restart', async () => {
	const { inbox, writes } = create({ owner: 'me' })
	const mention = { ...item('mention'), category: 'mentions' as const }
	inbox.importHistory([item('friend'), mention])
	inbox.clear('friend_request')
	await inbox.flush()
	const { inbox: restarted } = create(writes.at(-1)!)
	restarted.importHistory([item('another-old-friend'), mention])
	expect(restarted.getSnapshot().map(value => value.id)).toEqual(['mention'])
	await Promise.all([inbox.stop(), restarted.stop()])
})
