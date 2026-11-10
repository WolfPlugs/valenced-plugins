export type Session = {
	id_hash: string
	current?: boolean
	approx_last_used_time?: string | number | Date
}

export type SessionsStorage = {
	seen: Record<string, number>
	pending: string[]
	seeded: boolean
	owner?: string
}

export const defaults: SessionsStorage = {
	seen: {},
	pending: [],
	seeded: false,
}

export function parseSessions(value: unknown): Session[] {
	if (!Array.isArray(value)) return []
	return value.filter(
		(item): item is Session =>
			typeof item === 'object' &&
			item !== null &&
			typeof item.id_hash === 'string' &&
			item.id_hash.length > 0 &&
			(item.current === undefined || typeof item.current === 'boolean') &&
			(item.approx_last_used_time === undefined ||
				typeof item.approx_last_used_time === 'string' ||
				typeof item.approx_last_used_time === 'number' ||
				item.approx_last_used_time instanceof Date),
	)
}

function readStorage(value: unknown): SessionsStorage {
	if (typeof value !== 'object' || value === null)
		return { ...defaults, seen: {}, pending: [] }
	const seen =
		'seen' in value && typeof value.seen === 'object' && value.seen !== null
			? Object.fromEntries(
					Object.entries(value.seen).filter(
						(entry): entry is [string, number] =>
							typeof entry[1] === 'number' && Number.isFinite(entry[1]),
					),
				)
			: {}
	const pending =
		'pending' in value && Array.isArray(value.pending)
			? [
					...new Set(
						value.pending.filter(
							(hash): hash is string =>
								typeof hash === 'string' && Object.hasOwn(seen, hash),
						),
					),
				]
			: []
	return {
		seen,
		pending,
		seeded: 'seeded' in value && value.seeded === true,
		owner:
			'owner' in value && typeof value.owner === 'string'
				? value.owner
				: undefined,
	}
}

export function createSessionTracker(
	cached: unknown,
	save: (state: SessionsStorage) => void,
) {
	let state = readStorage(cached)
	const listeners = new Set<() => void>()
	function update(next: SessionsStorage) {
		state = next
		save(next)
		for (const listener of listeners) listener()
	}
	return {
		getSnapshot: () => state,
		setOwner(owner: string | undefined) {
			if (state.owner !== owner)
				update({ seen: {}, pending: [], seeded: false, owner })
		},
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		// Call only after a successful fetch, or a store update following that fetch.
		handle(sessions: Session[], owner: string) {
			const previous =
				state.owner === owner
					? state
					: { seen: {}, pending: [], seeded: false, owner }
			const seen = { ...previous.seen }
			const live = new Set(
				sessions
					.filter(session => !session.current)
					.map(session => session.id_hash),
			)
			const pending = new Set(previous.pending.filter(hash => live.has(hash)))
			for (const hash of live) {
				if (Object.hasOwn(seen, hash)) continue
				seen[hash] = Date.now()
				if (previous.seeded) pending.add(hash)
			}
			if (
				previous !== state ||
				!state.seeded ||
				Object.keys(seen).length !== Object.keys(state.seen).length ||
				pending.size !== state.pending.length
			) {
				update({ seen, pending: [...pending], seeded: true, owner })
			}
		},
		acknowledge(hashes: readonly string[]) {
			const pending = state.pending.filter(hash => !hashes.includes(hash))
			if (pending.length !== state.pending.length) update({ ...state, pending })
		},
	}
}

export type SessionTracker = ReturnType<typeof createSessionTracker>

export function formatTimestamp(
	value: Session['approx_last_used_time'],
): string | undefined {
	if (value === undefined) return
	const date = value instanceof Date ? value : new Date(value)
	if (!Number.isFinite(date.getTime())) return
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		second: '2-digit',
	})
}
