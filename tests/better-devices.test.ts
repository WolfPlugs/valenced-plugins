import { describe, expect, test } from 'bun:test'
import { logOutSessions } from '../plugins/better-devices/src/lib/logout'
import {
	createSessionTracker,
	formatTimestamp,
	parseSessions,
} from '../plugins/better-devices/src/lib/sessions'
import type {
	Session,
	SessionsStorage,
} from '../plugins/better-devices/src/lib/sessions'

describe('Better Devices session tracking', () => {
	test('an empty first fetch establishes the baseline, then a new device alerts', () => {
		const saved: SessionsStorage[] = []
		const tracker = createSessionTracker(undefined, state => saved.push(state))
		tracker.handle([], 'alice')
		expect(tracker.getSnapshot().seeded).toBe(true)
		tracker.handle([{ id_hash: 'first-device' }], 'alice')
		expect(tracker.getSnapshot().pending).toEqual(['first-device'])
		expect(saved).toHaveLength(2)
	})

	test('existing and current devices do not alert; only unseen devices do', () => {
		const tracker = createSessionTracker(undefined, () => {})
		const current = { id_hash: 'current', current: true }
		tracker.handle([current, { id_hash: 'existing' }], 'alice')
		expect(tracker.getSnapshot().pending).toEqual([])
		tracker.handle(
			[current, { id_hash: 'existing' }, { id_hash: 'new' }],
			'alice',
		)
		expect(tracker.getSnapshot().pending).toEqual(['new'])
		expect(tracker.getSnapshot().seen).not.toHaveProperty('current')
		const snapshot = tracker.getSnapshot()
		tracker.handle(
			[current, { id_hash: 'existing' }, { id_hash: 'new' }],
			'alice',
		)
		expect(tracker.getSnapshot()).toBe(snapshot)
	})

	test('acknowledging the viewed devices preserves arrivals since the screen opened', () => {
		const tracker = createSessionTracker(undefined, () => {})
		tracker.handle([], 'alice')
		tracker.handle([{ id_hash: 'one' }], 'alice')
		const viewed = [...tracker.getSnapshot().pending]
		tracker.handle([{ id_hash: 'one' }, { id_hash: 'two' }], 'alice')
		tracker.acknowledge(viewed)
		expect(tracker.getSnapshot().pending).toEqual(['two'])
		tracker.handle([{ id_hash: 'one' }], 'alice')
		expect(tracker.getSnapshot().pending).toEqual([])
	})

	test('pending alerts survive a restart, while account switches reset the baseline', () => {
		const tracker = createSessionTracker(
			{
				seen: { existing: 1, new: 2 },
				pending: ['new'],
				seeded: true,
				owner: 'alice',
			},
			() => {},
		)
		tracker.setOwner('alice')
		tracker.handle([{ id_hash: 'existing' }, { id_hash: 'new' }], 'alice')
		expect(tracker.getSnapshot().pending).toEqual(['new'])
		tracker.setOwner('bob')
		expect(tracker.getSnapshot().pending).toEqual([])
		tracker.handle([{ id_hash: 'bobs-device' }], 'bob')
		expect(tracker.getSnapshot().pending).toEqual([])
		expect(tracker.getSnapshot().seen).not.toHaveProperty('existing')
	})

	test('malformed storage and session entries are rejected at the boundary', () => {
		const tracker = createSessionTracker(
			{
				seen: { good: 1, bad: 'x' },
				pending: ['good', 'bad', 4, 'good'],
				seeded: true,
			},
			() => {},
		)
		expect(tracker.getSnapshot().pending).toEqual(['good'])
		expect(
			parseSessions([
				null,
				{},
				{ id_hash: 1 },
				{ id_hash: '' },
				{ id_hash: 'valid' },
				{ id_hash: 'bad', current: 'yes' },
			]),
		).toEqual([{ id_hash: 'valid' }])
		expect(formatTimestamp('not a date')).toBeUndefined()
		expect(formatTimestamp('2026-01-02T03:04:05Z')).toContain('2026')
	})

	test('subscriptions unsubscribe cleanly', () => {
		const tracker = createSessionTracker(undefined, () => {})
		let calls = 0
		const unsubscribe = tracker.subscribe(() => calls++)
		tracker.handle([], 'alice')
		unsubscribe()
		tracker.handle([{ id_hash: 'new' }], 'alice')
		expect(calls).toBe(1)
	})
})

describe('Better Devices logout', () => {
	function harness(
		sessions: Session[],
		request: (hashes: string[]) => Promise<unknown>,
	) {
		let refreshes = 0
		const errors: unknown[] = []
		return {
			options: {
				getSessions: () => sessions,
				request,
				refresh: async () => {
					refreshes++
				},
				reportError: (error: unknown) => {
					errors.push(error)
				},
			},
			refreshes: () => refreshes,
			errors,
		}
	}

	test('never sends the current device or stale entries, and deduplicates selections', async () => {
		const requests: string[][] = []
		const h = harness(
			[{ id_hash: 'current', current: true }, { id_hash: 'other' }],
			async hashes => {
				requests.push(hashes)
			},
		)
		const result = await logOutSessions({
			...h.options,
			hashes: ['current', 'stale', 'other', 'other'],
		})
		expect(requests).toEqual([['other']])
		expect(result).toEqual({
			removed: ['other'],
			failed: ['current', 'stale'],
			mfa: false,
		})
		expect(h.refreshes()).toBe(1)
	})

	test('stops at MFA without retrying the batch or claiming success', async () => {
		const requests: string[][] = []
		const h = harness(
			[{ id_hash: 'one' }, { id_hash: 'two' }],
			async hashes => {
				requests.push(hashes)
				return { mfa: true, token: 'verification-token' }
			},
		)
		const result = await logOutSessions({
			...h.options,
			hashes: ['one', 'two'],
		})
		expect(result).toEqual({ removed: [], failed: ['one', 'two'], mfa: true })
		expect(requests).toEqual([['one']])
	})

	test('recognizes a rejected MFA challenge without treating it as a network failure', async () => {
		const h = harness([{ id_hash: 'one' }, { id_hash: 'two' }], async () => {
			throw { body: { code: 60003 } }
		})
		const result = await logOutSessions({
			...h.options,
			hashes: ['one', 'two'],
		})
		expect(result).toEqual({ removed: [], failed: ['one', 'two'], mfa: true })
		expect(h.errors).toEqual([])
	})

	test('reports partial failures and continues with remaining devices', async () => {
		const failure = new Error('network failed')
		const h = harness(
			[{ id_hash: 'one' }, { id_hash: 'two' }],
			async ([hash]) => {
				if (hash === 'one') throw failure
			},
		)
		const result = await logOutSessions({
			...h.options,
			hashes: ['one', 'two'],
		})
		expect(result).toEqual({ removed: ['two'], failed: ['one'], mfa: false })
		expect(h.errors).toEqual([failure])
	})

	test('rechecks the store before each request', async () => {
		const sessions: Session[] = [{ id_hash: 'one' }, { id_hash: 'two' }]
		const requests: string[][] = []
		const h = harness(sessions, async hashes => {
			requests.push(hashes)
			sessions[1] = { id_hash: 'two', current: true }
		})
		const result = await logOutSessions({
			...h.options,
			hashes: ['one', 'two'],
		})
		expect(requests).toEqual([['one']])
		expect(result.failed).toEqual(['two'])
	})

	test('stopping the plugin or changing accounts cancels remaining requests', async () => {
		let active = true
		const requests: string[][] = []
		const h = harness(
			[{ id_hash: 'one' }, { id_hash: 'two' }],
			async hashes => {
				requests.push(hashes)
				active = false
			},
		)
		const result = await logOutSessions({
			...h.options,
			hashes: ['one', 'two'],
			isActive: () => active,
		})
		expect(requests).toEqual([['one']])
		expect(result.failed).toEqual(['two'])
		expect(h.refreshes()).toBe(0)
	})

	test('a refresh failure does not discard successful logout results', async () => {
		const h = harness([{ id_hash: 'one' }], async () => {})
		const failure = new Error('refresh failed')
		const result = await logOutSessions({
			...h.options,
			hashes: ['one'],
			refresh: async () => {
				throw failure
			},
		})
		expect(result.removed).toEqual(['one'])
		expect(h.errors).toEqual([failure])
	})
})
