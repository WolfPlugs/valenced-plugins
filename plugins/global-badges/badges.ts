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
export type Animation = 'all' | 'none'

const AnimatedUrl = /\.(gif|apng)(\?|#|$)|[?&]animated=true/i

// Animated images play at full speed in a native image view, and a profile
// full of them is slow. A still of the first frame, scaled to badge size, is
// what a limited profile loads instead
function stillUrl(url: string) {
	return `https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png&w=64`
}

export interface Settings {
	left: boolean
	showAll: boolean
	badgeOrder: Record<string, (string | number)[]>
	updateOnMetered?: boolean
	lastFetched?: number
	showModStyle: ModStyle
	animation: Animation
	providers: Partial<Record<keyof typeof Providers, boolean>>
}

export const DefaultSettings: Settings = {
	left: false,
	showAll: false,
	badgeOrder: {},
	showModStyle: 'none',
	animation: 'all',
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
	// The badge as published, animated. The badges screen shows this one
	original: string
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
	// A profile asks for the same user's badges on every render
	const results = new Map<string, unknown[]>()

	function notify() {
		props.clear()
		results.clear()
		version++
		for (const listener of listeners) listener()
	}

	function build(original: unknown[], userId: string) {
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
			let uri = badge.badge
			if (settings.animation === 'none' && AnimatedUrl.test(uri))
				uri = stillUrl(uri)
			props.set(id, {
				id,
				userId,
				source: { uri },
				original: badge.badge,
				label,
			})
			badges.push({
				id,
				description: label,
				icon: 'dummy',
				iconSrc: uri,
			})
		}
		if (!badges.length)
			return native.length === original.length ? original : native
		return orderBadges(
			settings.left ? [...badges, ...native] : [...native, ...badges],
			settings.badgeOrder[userId] ?? [],
		)
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
			const key = original
				.map(badge => (isRecord(badge) ? String(badge.id) : ''))
				.join()
			const cacheKey = `${userId}|${key}`
			const known = results.get(cacheKey)
			if (known) return known
			const badges = build(original, userId)
			results.set(cacheKey, badges)
			return badges
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
