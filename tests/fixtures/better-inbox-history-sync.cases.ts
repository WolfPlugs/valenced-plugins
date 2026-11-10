import { expect, mock, test } from 'bun:test'
import { createInbox } from '../../plugins/better-inbox/src/lib/inbox'
import type { InboxController } from '../../plugins/better-inbox/src/ui/context'

const listeners = new Set<() => void>()
const pendingRequest = {
	id: '1420070400000000000',
	type: 'INCOMING_FRIEND_REQUESTS',
	other_user: { id: 'friend' },
}
const source = {
	items: [],
	localItems: [pendingRequest],
	addChangeListener: (fn: () => void) => listeners.add(fn),
	removeChangeListener: (fn: () => void) => listeners.delete(fn),
}
const urls: string[] = []
mock.module('@valenced/discord/flux', () => ({
	Stores: {
		UserStore: {
			getCurrentUser: () => ({ id: 'me', username: 'Me' }),
			getUser: (id: string) => ({ id, username: 'Friend' }),
		},
	},
	getStore(name: string, callback: (store: object) => void) {
		if (name === 'NotificationCenterItemsStore') callback(source)
		return () => {}
	},
}))
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: () => ({}),
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule: () => [
		{
			HTTP: {
				async get({ url }: { url: string }) {
					urls.push(url)
					if (url.endsWith('/mentions'))
						return {
							body: [
								{
									id: 'message',
									channel_id: 'channel',
									author: { id: 'friend', username: 'Friend' },
									content: 'Hello',
								},
							],
						}
					return {
						body: {
							items: [
								{
									id: 'remote',
									type: 'reaction_sent',
									body: 'A reaction',
									other_user: { id: 'friend' },
								},
							],
							has_more: false,
						},
					}
				},
			},
		},
	],
}))
const { installHistorySync } = await import(
	'../../plugins/better-inbox/src/lib/historySync'
)

test('loads both read endpoints without waiting for lazy inbox actions, and keeps native requests', async () => {
	const cleanups: (() => void)[] = []
	const errors: unknown[] = []
	const inbox = createInbox({
		owner: 'me',
		read: () => ({}),
		save: async () => {},
		reportError: error => errors.push(error),
	})
	const controller = {
		inbox,
		storage: { cache: {} },
		reportError: (error: unknown) => errors.push(error),
	} as InboxController
	const refresh = installHistorySync(
		controller,
		fn => cleanups.push(fn),
		() => {},
	)
	await Promise.resolve()
	expect(
		inbox.getSnapshot().some(item => item.category === 'friend_request'),
	).toBe(true)
	await Promise.all([refresh(), refresh()])
	expect(urls.sort()).toEqual([
		'/users/@me/mentions',
		'/users/@me/notification-center/items',
	])
	expect(
		inbox
			.getSnapshot()
			.map(item => item.category)
			.sort(),
	).toEqual(['friend_request', 'mentions', 'reactions'])
	inbox.clear()
	for (const listener of listeners) listener()
	await Promise.resolve()
	expect(inbox.getSnapshot()).toEqual([])
	for (const cleanup of cleanups.reverse()) cleanup()
	expect(listeners.size).toBe(0)
	await refresh()
	await inbox.stop()
	expect(errors).toEqual([])
})
