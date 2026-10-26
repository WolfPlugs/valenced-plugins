export const Providers = {
	aero: 'Aero',
	raincord: 'Raincord',
	aliucord: 'Aliucord',
	badgevault: 'BadgeVault',
	betterdiscord: 'BetterDiscord',
	bunny: 'Bunny',
	enmity: 'Enmity',
	equicord: 'Equicord',
	goosemod: 'GooseMod',
	nekocord: 'Nekocord',
	paicord: 'Paicord',
	record: 'ReCord',
	replugged: 'Replugged',
	reviewdb: 'ReviewDB',
	velocity: 'Velocity',
	vencord: 'Vencord',
	vendroidenhanced: 'Vendroid Enhanced',
}

export type ModStyle = 'none' | 'prefix' | 'suffix'

export interface Settings {
	left: boolean
	showAll: boolean
	badgeOrder: Record<string, (string | number)[]>
	updateOnMetered?: boolean
	lastFetched?: number
	showModStyle: ModStyle
	providers: Partial<Record<keyof typeof Providers, boolean>>
}

export const DefaultSettings: Settings = {
	left: false,
	showAll: false,
	badgeOrder: {},
	showModStyle: 'none',
	providers: {},
}

export interface Badge {
	mod: string
	badge: string
	tooltip: string
}

export interface BadgeProps {
	id: string
	source: { uri: string }
	label: string
	userId: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBadge(value: unknown): value is Badge {
	return (
		isRecord(value) &&
		typeof value.mod === 'string' &&
		value.mod.length > 0 &&
		typeof value.badge === 'string' &&
		/^https?:\/\//i.test(value.badge) &&
		typeof value.tooltip === 'string'
	)
}

export function parseBadges(value: unknown): Map<string, Badge[]> {
	if (!isRecord(value) || !isRecord(value.users))
		throw new Error('Invalid global badges response')

	const users = new Map<string, Badge[]>()
	for (const [userId, badges] of Object.entries(value.users)) {
		if (!Array.isArray(badges)) continue
		const valid = badges.filter(
			(badge): badge is Badge =>
				isBadge(badge) && badge.mod.toLowerCase() !== 'revenge',
		)
		if (valid.length) users.set(userId, valid)
	}
	return users
}

export function createBadgeStore() {
	let users = new Map<string, Badge[]>()
	let settings = DefaultSettings
	let version = 0
	const listeners = new Set<() => void>()
	const props = new Map<string, BadgeProps>()

	function notify() {
		props.clear()
		version++
		for (const listener of listeners) listener()
	}

	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		getSnapshot: () => version,
		setUsers(value: Map<string, Badge[]>) {
			users = value
			notify()
		},
		setSettings(value: Settings) {
			settings = value
			notify()
		},
		getProps: (id: string) => props.get(id),
		addBadges(original: unknown[], userId: string) {
			const native = original.filter(
				badge =>
					!isRecord(badge) ||
					typeof badge.id !== 'string' ||
					!badge.id.startsWith('gb-'),
			)
			const badges = []
			for (const badge of users.get(userId) ?? []) {
				const provider = Object.entries(Providers).find(
					([key]) => key === badge.mod,
				)
				if (
					provider &&
					settings.providers[provider[0] as keyof typeof Providers] === false
				)
					continue
				const name = provider?.[1] ?? badge.mod
				const label =
					settings.showModStyle === 'prefix'
						? `${name} - ${badge.tooltip}`
						: settings.showModStyle === 'suffix'
							? `${badge.tooltip} - ${name}`
							: badge.tooltip
				const id = `gb-${userId}-${encodeURIComponent(`${badge.mod}:${badge.badge}`)}`
				props.set(id, { id, userId, source: { uri: badge.badge }, label })
				badges.push({
					id,
					description: label,
					icon: 'dummy',
					iconSrc: badge.badge,
				})
			}
			if (!badges.length)
				return native.length === original.length ? original : native
			return orderBadges(
				settings.left ? [...badges, ...native] : [...native, ...badges],
				settings.badgeOrder[userId] ?? [],
			)
		},
	}
}

export function isCustomBadgeId(id: unknown): id is string {
	return typeof id === 'string' && id.startsWith('gb-')
}

export function orderBadges<T>(
	badges: T[],
	order: (string | number)[],
	key = 'id',
	resolve = (id: string | number): string | number => id,
): T[] {
	if (!order.length) return badges
	const ranks = new Map(order.map((id, index) => [id, index]))
	return [...badges].sort((a, b) => {
		const first =
			isRecord(a) && (typeof a[key] === 'string' || typeof a[key] === 'number')
				? resolve(a[key])
				: ''
		const second =
			isRecord(b) && (typeof b[key] === 'string' || typeof b[key] === 'number')
				? resolve(b[key])
				: ''
		return (
			(ranks.get(first) ?? order.length) - (ranks.get(second) ?? order.length)
		)
	})
}
