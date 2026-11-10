import { describe, expect, test } from 'bun:test'
import {
	createInbox,
	isNotification,
	storageLimit,
} from '../plugins/better-inbox/src/lib/inbox'
import type {
	BetterInboxStorage,
	NotificationItem,
} from '../plugins/better-inbox/src/lib/types'

function notification(
	id: string,
	category: NotificationItem['category'] = 'mentions',
): NotificationItem {
	return {
		id,
		category,
		title: id,
		content: '',
		guildName: '',
		channelName: '',
		timestamp: '12:00',
	}
}
function setup(
	initial: BetterInboxStorage = {},
	owner: string | undefined = 'alice',
) {
	const saved: BetterInboxStorage[] = []
	const errors: unknown[] = []
	const inbox = createInbox({
		read: () => initial,
		owner,
		save: async state => {
			saved.push(state)
		},
		reportError: error => errors.push(error),
	})
	return { inbox, saved, errors }
}

describe('BetterInbox history', () => {
	test('restores only valid records belonging to the signed-in account', async () => {
		const good = notification('good')
		const { inbox } = setup({
			owner: 'alice',
			notifications: [
				good,
				{ ...good, content: null } as unknown as NotificationItem,
			],
		})
		expect(inbox.getSnapshot()).toEqual([good])
		await inbox.stop()
		for (const owner of ['bob', undefined]) {
			const { inbox } = setup({ owner, notifications: [good] })
			expect(inbox.getSnapshot()).toEqual([])
			await inbox.stop()
		}
	})
	test('deduplicates live events and bounds history newest first', async () => {
		const { inbox, saved } = setup({ maxStored: 2 })
		inbox.push(notification('one'))
		inbox.push(notification('two'))
		const snapshot = inbox.getSnapshot()
		inbox.push(notification('two'))
		expect(inbox.getSnapshot()).toBe(snapshot)
		inbox.push(notification('three'))
		expect(inbox.getSnapshot().map(item => item.id)).toEqual(['three', 'two'])
		await inbox.stop()
		expect(saved).toEqual([
			{
				owner: 'alice',
				dismissed: [],
				clearedAt: {},
				notifications: inbox.getSnapshot(),
			},
		])
	})
	test('clears one category and deletes an item without removing other categories', async () => {
		const { inbox } = setup()
		inbox.push(notification('mention'))
		inbox.push(notification('reaction', 'reactions'))
		inbox.push(notification('reply', 'replies'))
		inbox.clear('mentions')
		inbox.delete('reaction')
		expect(inbox.getSnapshot().map(item => item.id)).toEqual(['reply'])
		await inbox.stop()
	})
	test('account switches clear the visible feed and pending saves use the new owner', async () => {
		const { inbox, saved } = setup()
		inbox.push(notification('alice-secret'))
		inbox.setOwner('bob')
		expect(inbox.getSnapshot()).toEqual([])
		inbox.push(notification('bob-message'))
		await inbox.stop()
		expect(saved).toEqual([
			{
				owner: 'bob',
				dismissed: [],
				clearedAt: {},
				notifications: [notification('bob-message')],
			},
		])
	})
	test('logout blocks new entries and shutdown flushes once without accepting later events', async () => {
		const { inbox, saved } = setup()
		inbox.push(notification('old'))
		inbox.setOwner(undefined)
		inbox.push(notification('logged-out'))
		await inbox.stop()
		inbox.push(notification('stopped'))
		await inbox.stop()
		expect(inbox.getSnapshot()).toEqual([])
		expect(saved).toHaveLength(1)
	})
	test('serializes writes so an older save cannot overwrite a newer snapshot', async () => {
		let release: () => void = () => {}
		const first = new Promise<void>(resolve => {
			release = resolve
		})
		const saved: string[][] = []
		const inbox = createInbox({
			owner: 'alice',
			read: () => ({}),
			reportError: error => {
				throw error
			},
			save: async state => {
				saved.push((state.notifications ?? []).map(item => item.id))
				if (saved.length === 1) await first
			},
		})
		inbox.push(notification('one'))
		const firstSave = inbox.flush()
		await Promise.resolve()
		inbox.push(notification('two'))
		const stopped = inbox.stop()
		expect(saved).toEqual([['one']])
		release()
		await Promise.all([firstSave, stopped])
		expect(saved).toEqual([['one'], ['two', 'one']])
	})
	test('reports persistence failures and a later update can still save', async () => {
		let fail = true
		const errors: unknown[] = []
		const saved: BetterInboxStorage[] = []
		const failure = new Error('disk full')
		const inbox = createInbox({
			owner: 'alice',
			read: () => ({}),
			reportError: error => errors.push(error),
			save: async state => {
				if (fail) throw failure
				saved.push(state)
			},
		})
		inbox.push(notification('one'))
		await inbox.flush()
		expect(errors).toEqual([failure])
		fail = false
		inbox.push(notification('two'))
		await inbox.stop()
		expect(saved[0]?.notifications).toHaveLength(2)
	})
	test('a bad subscriber is reported without preventing other subscribers from updating', async () => {
		const { inbox, errors } = setup()
		let calls = 0
		inbox.subscribe(() => {
			throw new Error('render failed')
		})
		const unsubscribe = inbox.subscribe(() => {
			calls++
		})
		inbox.push(notification('one'))
		unsubscribe()
		inbox.push(notification('two'))
		expect(calls).toBe(1)
		expect(errors).toHaveLength(2)
		await inbox.stop()
	})
	test('rejects malformed disk records and clamps invalid storage limits', () => {
		expect(isNotification(null)).toBe(false)
		expect(
			isNotification({ ...notification('bad'), author: { id: 'a' } }),
		).toBe(false)
		expect(isNotification({ ...notification('bad'), channelId: {} })).toBe(
			false,
		)
		expect(
			isNotification({ ...notification('bad'), category: 'unexpected' }),
		).toBe(false)
		expect(storageLimit(NaN)).toBe(300)
		expect(storageLimit(-20)).toBe(1)
		expect(storageLimit(1000000)).toBe(1000)
	})
})
