import type {
	BetterInboxStorage,
	NotificationCategory,
	NotificationItem,
} from './types'

export function storageLimit(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.max(1, Math.min(1000, Math.floor(value)))
		: 300
}

export function isNotification(value: unknown): value is NotificationItem {
	if (!value || typeof value !== 'object') return false
	const item = value as Partial<NotificationItem>
	return (
		typeof item.id === 'string' &&
		(item.createdAt === undefined ||
			(typeof item.createdAt === 'number' &&
				Number.isFinite(item.createdAt))) &&
		[
			'mentions',
			'replies',
			'reactions',
			'friend_request',
			'thread',
			'other',
		].includes(item.category ?? '') &&
		['title', 'content', 'guildName', 'channelName', 'timestamp'].every(
			key => typeof Reflect.get(value, key) === 'string',
		) &&
		['guildId', 'channelId', 'messageId'].every(
			key =>
				Reflect.get(value, key) === undefined ||
				typeof Reflect.get(value, key) === 'string',
		) &&
		(item.subCategory === undefined ||
			['people', 'role', 'bot'].includes(item.subCategory)) &&
		(item.author === undefined ||
			(item.author !== null &&
				typeof item.author === 'object' &&
				typeof item.author.id === 'string' &&
				typeof item.author.username === 'string' &&
				(item.author.globalName === undefined ||
					typeof item.author.globalName === 'string') &&
				(item.author.avatar == null ||
					typeof item.author.avatar === 'string') &&
				(item.author.discriminator === undefined ||
					typeof item.author.discriminator === 'string') &&
				(item.author.bot === undefined ||
					typeof item.author.bot === 'boolean')))
	)
}

export function createInbox({
	read,
	save,
	reportError,
	owner,
}: {
	read: () => BetterInboxStorage | undefined
	save: (
		state: Pick<BetterInboxStorage, 'notifications' | 'owner' | 'dismissed'>,
	) => Promise<void>
	reportError: (error: unknown) => void
	owner: string | undefined
}) {
	const listeners = new Set<() => void>()
	const initial = read()
	// Unowned history cannot safely be assigned to the current account.
	let items =
		initial &&
		initial.owner === owner &&
		owner &&
		Array.isArray(initial.notifications)
			? initial.notifications
					.filter(isNotification)
					.slice(0, storageLimit(initial.maxStored))
			: []
	let dismissed = new Set<string>(
		initial?.owner === owner && Array.isArray(initial?.dismissed)
			? initial.dismissed.filter(
					(id: unknown): id is string => typeof id === 'string',
				)
			: [],
	)
	let timer: ReturnType<typeof setTimeout> | undefined
	let active = true
	let dirty = false
	let writes = Promise.resolve()

	function persist() {
		if (timer !== undefined) clearTimeout(timer)
		timer = undefined
		if (!dirty) return writes
		dirty = false
		const state = { notifications: items, owner, dismissed: [...dismissed] }
		writes = writes.then(() => save(state)).catch(reportError)
		return writes
	}
	function changed() {
		dirty = true
		if (timer !== undefined) clearTimeout(timer)
		timer = setTimeout(() => {
			void persist()
		}, 1000)
		for (const listener of listeners) {
			try {
				listener()
			} catch (error) {
				reportError(error)
			}
		}
	}
	return {
		getSnapshot: () => items,
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		setOwner(next: string | undefined) {
			if (!active || owner === next) return
			owner = next
			dismissed = new Set()
			items = []
			changed()
		},
		push(item: NotificationItem) {
			if (
				!active ||
				!owner ||
				dismissed.has(item.id) ||
				items.some(existing => existing.id === item.id)
			)
				return
			items = [item, ...items].slice(0, storageLimit(read()?.maxStored))
			changed()
		},
		importHistory(history: NotificationItem[]) {
			if (!active || !owner) return
			const merged = new Map(items.map(item => [item.id, item]))
			for (const item of history) {
				if (dismissed.has(item.id)) continue
				const existing = merged.get(item.id)
				// A native reply notification has stronger classification than a
				// recent-mentions record whose referenced message is unavailable.
				const next =
					existing?.category === 'replies' && item.category === 'mentions'
						? {
								...item,
								category: existing.category,
								subCategory: undefined,
								title: existing.title,
							}
						: item
				merged.set(
					item.id,
					existing && JSON.stringify(existing) === JSON.stringify(next)
						? existing
						: next,
				)
			}
			const next = [...merged.values()]
				.sort(
					(a, b) =>
						(b.createdAt ?? Number.MAX_SAFE_INTEGER) -
						(a.createdAt ?? Number.MAX_SAFE_INTEGER),
				)
				.slice(0, storageLimit(read()?.maxStored))
			if (
				next.length === items.length &&
				next.every((item, index) => item === items[index])
			)
				return
			items = next
			changed()
		},
		clear(category?: NotificationCategory) {
			if (!active) return
			for (const item of items)
				if (!category || item.category === category) dismissed.add(item.id)
			items = category ? items.filter(item => item.category !== category) : []
			changed()
		},
		delete(id: string) {
			if (!active) return
			dismissed.add(id)
			items = items.filter(item => item.id !== id)
			changed()
		},
		flush: persist,
		stop() {
			active = false
			listeners.clear()
			return persist()
		},
	}
}

export type Inbox = ReturnType<typeof createInbox>
