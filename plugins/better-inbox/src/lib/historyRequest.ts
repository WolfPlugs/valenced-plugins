import { storageLimit } from './inbox'

export interface DiscordHTTP {
	get(options: {
		url: string
		query?: Record<string, string | number | boolean>
		rejectWithError: boolean
	}): Promise<{ body: unknown }>
}
export function object(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object'
		? (value as Record<string, unknown>)
		: undefined
}

// These are the same read endpoints used by Discord's native inbox and mentions actions.
export async function fetchHistory({
	http,
	source,
	limit,
	isActive,
	receive,
}: {
	http: DiscordHTTP
	source: 'notifications' | 'mentions'
	limit: unknown
	isActive(): boolean
	receive(items: unknown[]): void
}) {
	let cursor: string | undefined
	const remainingLimit = storageLimit(limit)
	let loaded = 0
	const cursors = new Set<string>()
	while (isActive() && loaded < remainingLimit) {
		const size = Math.min(100, remainingLimit - loaded)
		const query: Record<string, string | number | boolean> =
			source === 'mentions'
				? { limit: size, roles: true, everyone: true }
				: {
						limit: size,
						with_mentions: true,
						roles_filter: true,
						everyone_filter: true,
					}
		if (cursor) query[source === 'mentions' ? 'before' : 'cursor'] = cursor
		const response = await http.get({
			url:
				source === 'mentions'
					? '/users/@me/mentions'
					: '/users/@me/notification-center/items',
			query,
			rejectWithError: true,
		})
		if (!isActive()) return
		const body = object(response.body)
		const values = source === 'mentions' ? response.body : body?.items
		if (!Array.isArray(values))
			throw new Error(`Discord returned an invalid ${source} response`)
		receive(
			source === 'mentions'
				? values.map(message => ({ type: 'recent_mention', message }))
				: values,
		)
		loaded += values.length
		if (
			!values.length ||
			(source === 'mentions' ? values.length < size : body?.has_more !== true)
		)
			return
		const next =
			source === 'mentions' ? object(values.at(-1))?.id : body?.cursor
		if (typeof next !== 'string' || !next || cursors.has(next)) return
		cursors.add(next)
		cursor = next
	}
}
