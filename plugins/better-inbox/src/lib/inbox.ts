import { snapshotAuthor } from './tracking/shared'
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

// Categories have separate limits so a busy mentions feed cannot evict Friends.
export function limitNotifications(
	items: NotificationItem[],
	maximum: unknown,
): NotificationItem[] {
	const limit = storageLimit(maximum)
	const counts = new Map<NotificationCategory, number>()
	return items.filter(item => {
		const count = counts.get(item.category) ?? 0
		if (count >= limit) return false
		counts.set(item.category, count + 1)
		return true
	})
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
				(item.author.globalName == null ||
					typeof item.author.globalName === 'string') &&
				(item.author.avatar == null ||
					typeof item.author.avatar === 'string') &&
				(item.author.discriminator == null ||
					typeof item.author.discriminator === 'string') &&
				(item.author.bot == null || typeof item.author.bot === 'boolean')))
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
		state: Pick<
			BetterInboxStorage,
			'notifications' | 'owner' | 'dismissed' | 'clearedAt'
		>,
	) => Promise<void>
	reportError: (error: unknown) => void
	owner: string | undefined
}) {
	const listeners = new Set<() => void>()
	const initial = read()
	// Discord may identify the account after plugins start. Keep the saved
	// snapshot private until its owner is confirmed instead of discarding it.
	let waitingForOwner = owner === undefined
	function restore(nextOwner: string | undefined) {
		const owned =
			nextOwner && initial?.owner === nextOwner ? initial : undefined
		const restoredItems = Array.isArray(owned?.notifications)
			? limitNotifications(
					owned.notifications.filter(isNotification).map(item => ({
						...item,
						author: item.author ? snapshotAuthor(item.author) : undefined,
					})),
					owned.maxStored,
				)
			: []
		const restoredDismissed = new Set<string>(
			Array.isArray(owned?.dismissed)
				? owned.dismissed.filter(
						(id: unknown): id is string => typeof id === 'string',
					)
				: [],
		)
		const restoredClearedAt: Partial<Record<NotificationCategory, number>> = {}
		if (owned?.clearedAt && typeof owned.clearedAt === 'object') {
			for (const category of [
				'mentions',
				'replies',
				'reactions',
				'friend_request',
				'thread',
				'other',
			] as const) {
				const time = owned.clearedAt[category]
				if (typeof time === 'number' && Number.isFinite(time))
					restoredClearedAt[category] = time
			}
		}
		return { restoredItems, restoredDismissed, restoredClearedAt }
	}
	const restored = restore(owner)
	let items: NotificationItem[] = restored.restoredItems
	let dismissed = restored.restoredDismissed
	let clearedAt = restored.restoredClearedAt
	let timer: ReturnType<typeof setTimeout> | undefined
	let active = true
	let dirty = false
	let writes = Promise.resolve()

	function persist() {
		if (timer !== undefined) clearTimeout(timer)
		timer = undefined
		if (!dirty) return writes
		dirty = false
		const state = {
			notifications: items,
			owner,
			dismissed: [...dismissed],
			clearedAt: { ...clearedAt },
		}
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
			const restored = waitingForOwner ? restore(next) : undefined
			if (next !== undefined) waitingForOwner = false
			dismissed = restored?.restoredDismissed ?? new Set()
			clearedAt = restored?.restoredClearedAt ?? {}
			items = restored?.restoredItems ?? []
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
			items = limitNotifications([item, ...items], read()?.maxStored)
			changed()
		},
		importHistory(history: NotificationItem[]) {
			if (!active || !owner) return
			const merged = new Map(items.map(item => [item.id, item]))
			for (const item of history) {
				if (
					dismissed.has(item.id) ||
					(clearedAt[item.category] !== undefined &&
						(item.createdAt ?? 0) <= clearedAt[item.category]!)
				)
					continue
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
			const next = limitNotifications(
				[...merged.values()].sort(
					(a, b) =>
						(b.createdAt ?? Number.MAX_SAFE_INTEGER) -
						(a.createdAt ?? Number.MAX_SAFE_INTEGER),
				),
				read()?.maxStored,
			)
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
			const now = Date.now()
			for (const key of [
				'mentions',
				'replies',
				'reactions',
				'friend_request',
				'thread',
				'other',
			] as const) {
				if (!category || key === category) clearedAt[key] = now
			}
			items = category ? items.filter(item => item.category !== category) : []
			changed()
			// A process exit does not run plugin cleanup. Persist explicit clears now.
			void persist()
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
