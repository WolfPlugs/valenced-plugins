import { expect, mock, test } from 'bun:test'
import * as React from 'react'
import type { EventPayload } from '../../plugins/better-inbox/src/lib/discordTypes'
import type { BetterInboxStorage } from '../../plugins/better-inbox/src/lib/types'
import type { InboxController } from '../../plugins/better-inbox/src/ui/context'

type Handler = (payload: EventPayload & { type: string }) => unknown
const flux = new Map<string, Handler>()
const listeners = new Set<() => void>()
let owner = 'alice'
let controller: InboxController | undefined
let closed = 0
const errors: unknown[] = []
const cleanups: (() => void)[] = []
const storage = {
	cache: {} as BetterInboxStorage,
	async set(state: Partial<BetterInboxStorage>) {
		Object.assign(this.cache, state)
	},
}
const stores = {
	UserStore: {
		getCurrentUser: () => ({ id: owner, username: owner }),
		getUser: (id: string) => ({ id, username: id }),
		addChangeListener: (listener: () => void) => listeners.add(listener),
		removeChangeListener: (listener: () => void) => listeners.delete(listener),
	},
	ChannelStore: { getChannel: () => ({ id: 'channel' }) },
}
mock.module('@valenced/discord/flux', () => ({
	Stores: stores,
	onFluxEventDispatched(event: string, callback: Handler) {
		flux.set(event, callback)
		return () => flux.delete(event)
	},
}))
mock.module('../../plugins/better-inbox/src/lib/historySync', () => ({
	installHistorySync: () => async () => {},
}))
mock.module('@valenced/react', () => ({ React }))
mock.module('../../plugins/better-inbox/src/patches', () => ({
	installPatches(next: InboxController) {
		controller = next
	},
}))
mock.module('../../plugins/better-inbox/src/ui/Settings', () => ({
	default: () => null,
}))
mock.module('../../plugins/better-inbox/src/ui/openInbox', () => ({
	closeInboxSheets() {
		closed++
	},
}))
// The loader normally supplies plugin(). This host test only captures the definition.
Object.assign(globalThis, { plugin: (definition: unknown) => definition })
const { default: definition } = await import(
	'../../plugins/better-inbox/src/index'
)

test('event passthrough, account isolation, error reporting and teardown', async () => {
	definition.start!({
		jsonStorage: storage,
		cleanup: (callback: () => void) => cleanups.push(callback),
		plugin: {
			reportError: (error: unknown) => errors.push(error),
			startedLate: false,
		},
	} as unknown as Parameters<NonNullable<typeof definition.start>>[0])
	const runtime = controller
	if (!runtime) throw new Error('Missing runtime controller')
	expect(flux.size).toBe(6)
	expect(listeners.size).toBe(1)
	const message = {
		type: 'MESSAGE_CREATE',
		message: {
			id: 'one',
			channel_id: 'channel',
			author: { id: 'friend', username: 'Friend' },
			mentions: [{ id: 'alice' }],
		},
	}
	expect(flux.get('MESSAGE_CREATE')?.(message)).toBe(message)
	expect(runtime.inbox.getSnapshot()).toHaveLength(1)
	const failure = new Error('Discord store failed')
	const broken = {
		type: 'MESSAGE_CREATE',
		get message(): never {
			throw failure
		},
	}
	expect(flux.get('MESSAGE_CREATE')?.(broken)).toBe(broken)
	expect(errors).toEqual([failure])
	owner = 'bob'
	for (const listener of listeners) listener()
	expect(runtime.inbox.getSnapshot()).toHaveLength(0)
	expect(closed).toBe(0)
	await Promise.resolve()
	expect(closed).toBe(1)
	for (const cleanup of cleanups.reverse()) cleanup()
	await runtime.inbox.flush()
	expect(flux.size).toBe(0)
	expect(listeners.size).toBe(0)
	expect(storage.cache.owner).toBe('bob')
	expect(storage.cache.notifications).toEqual([])
	expect(definition.SettingsComponent?.({} as never)).toBeNull()
})
