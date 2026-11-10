import { expect, test } from 'bun:test'
import { fetchHistory } from '../plugins/better-inbox/src/lib/historyRequest'

test('loads additional notification pages up to the configured history limit', async () => {
	const queries: unknown[] = []
	const received: unknown[] = []
	await fetchHistory({
		source: 'notifications',
		limit: 3,
		isActive: () => true,
		receive: items => received.push(...items),
		http: {
			async get(options) {
				queries.push(options.query)
				return {
					body:
						queries.length === 1
							? {
									items: [{ id: 'one' }, { id: 'two' }],
									has_more: true,
									cursor: 'next',
								}
							: { items: [{ id: 'three' }], has_more: false },
				}
			},
		},
	})
	expect(received).toHaveLength(3)
	expect(queries[1]).toMatchObject({ cursor: 'next', limit: 1 })
})

test('loads recent-mention pages using the oldest message ID as before', async () => {
	const queries: unknown[] = []
	const received: unknown[] = []
	await fetchHistory({
		source: 'mentions',
		limit: 101,
		isActive: () => true,
		receive: items => received.push(...items),
		http: {
			async get(options) {
				queries.push(options.query)
				return {
					body:
						queries.length === 1
							? Array.from({ length: 100 }, (_, index) => ({
									id: String(1000 - index),
								}))
							: [{ id: '900' }],
				}
			},
		},
	})
	expect(received).toHaveLength(101)
	expect(queries[1]).toMatchObject({ before: '901', limit: 1 })
})

test('does not import an in-flight response after account change or shutdown', async () => {
	let active = true
	const received: unknown[] = []
	await fetchHistory({
		source: 'mentions',
		limit: 100,
		isActive: () => active,
		receive: items => received.push(...items),
		http: {
			async get() {
				active = false
				return { body: [{ id: 'private-message' }] }
			},
		},
	})
	expect(received).toEqual([])
})

test('reports malformed history as a failure rather than a successfully empty inbox', async () => {
	await expect(
		fetchHistory({
			source: 'notifications',
			limit: 100,
			isActive: () => true,
			receive() {},
			http: {
				async get() {
					return { body: {} }
				},
			},
		}),
	).rejects.toThrow('invalid notifications response')
})
