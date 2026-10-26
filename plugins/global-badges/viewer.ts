import { getStore } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { isCustomBadgeId, isRecord, orderBadges } from './badges'
import type { PluginApi } from '@valenced/plugins/types'
import type { createBadgeStore, Settings } from './badges'

type BadgeDirectory = {
	getBadges(userId?: string): unknown[]
	getBadgeById(id: string | number, userId?: string): unknown
	emitChange(): void
}
type UserStore = { getCurrentUser(): { id: string } | undefined }
type PendingBadges = {
	setPendingBadgeDisplayOrder(order: (string | number)[]): void
	setPendingBadgeVisibility(options: unknown): void
}

export function setupBadgeViewer(
	{ cleanup, jsonStorage, plugin }: PluginApi<{ jsonStorage: Settings }>,
	store: ReturnType<typeof createBadgeStore>,
) {
	let currentUser: UserStore | undefined
	let resolve = (id: string | number): string | number => id
	const catalogs = new Map<
		string,
		{ version: number; badges: Record<string, unknown>[] }
	>()
	cleanup(
		getStore<UserStore>('UserStore', value => {
			currentUser = value
		}),
	)
	cleanup(
		getModules(
			withProps<{
				resolveProfileBadgeId(id: string): string | number | null
				toProfileBadgeLegacyId(id: string | number): string
			}>('resolveProfileBadgeId', 'toProfileBadgeLegacyId'),
			module => {
				resolve = id =>
					typeof id === 'number' || isCustomBadgeId(id)
						? id
						: (module.resolveProfileBadgeId(id) ?? id)
				cleanup(
					instead(module, 'resolveProfileBadgeId', function (args, original) {
						return isCustomBadgeId(args[0])
							? args[0]
							: Reflect.apply(original, this, args)
					}),
				)
				cleanup(
					instead(module, 'toProfileBadgeLegacyId', function (args, original) {
						return isCustomBadgeId(args[0])
							? args[0]
							: Reflect.apply(original, this, args)
					}),
				)
			},
		),
	)

	cleanup(
		getModules(
			withProps<{
				getBadgeName(id: string | number): string
				getBadgeAssetFromCDN(icon: string): string
			}>('getBadgeName', 'getBadgeAssetFromCDN'),
			module => {
				cleanup(
					instead(module, 'getBadgeName', function (args, original) {
						return isCustomBadgeId(args[0])
							? args[0]
							: Reflect.apply(original, this, args)
					}),
				)
			},
		),
	)

	function catalog(userId: string) {
		const existing = catalogs.get(userId)
		const version = store.getSnapshot()
		if (existing?.version === version) return existing.badges
		const badges = store.addBadges([], userId).flatMap(value => {
			if (!isRecord(value) || typeof value.id !== 'string') return []
			const props = store.getProps(value.id)
			if (!props) return []
			return [
				{
					badge_id: props.id,
					name: props.label,
					info_label: props.label,
					description: props.label,
					owned: true,
					hidden: false,
					simple_icon_raster_url: props.source.uri,
					complex_icon_static_url: props.source.uri,
					tiers: [],
					current_tier: null,
					next_tier: null,
					requirements: [],
				},
			]
		})
		catalogs.set(userId, { version, badges })
		return badges
	}

	function ordered<T>(badges: T[], userId: string, key: string) {
		return orderBadges(
			badges,
			jsonStorage.cache?.badgeOrder?.[userId] ?? [],
			key,
			resolve,
		)
	}

	function addCatalog(original: unknown[], userId: string) {
		const native = original.filter(
			value => !isRecord(value) || !isCustomBadgeId(value.badge_id),
		)
		const custom = catalog(userId)
		return ordered(
			jsonStorage.cache?.left ? [...custom, ...native] : [...native, ...custom],
			userId,
			'badge_id',
		)
	}

	cleanup(
		getStore<BadgeDirectory>('BadgeDirectoryStore', directory => {
			cleanup(
				instead(directory, 'getBadges', function (args, original) {
					const result = Reflect.apply(original, this, args)
					const userId = args[0] ?? currentUser?.getCurrentUser()?.id
					return userId && Array.isArray(result)
						? addCatalog(result, userId)
						: result
				}),
			)
			cleanup(
				instead(directory, 'getBadgeById', function (args, original) {
					if (!isCustomBadgeId(args[0]))
						return Reflect.apply(original, this, args)
					const userId = args[1] ?? currentUser?.getCurrentUser()?.id
					return userId
						? catalog(userId).find(badge => badge.badge_id === args[0])
						: undefined
				}),
			)
			cleanup(store.subscribe(() => directory.emitChange()))
		}),
	)

	cleanup(
		getModules(
			withProps<Record<string, unknown>>(
				'MAX_DISPLAYED_PROFILE_BADGES',
				'getProfileBadgeIconUrl',
			),
			module => {
				const descriptor = Object.getOwnPropertyDescriptor(
					module,
					'MAX_DISPLAYED_PROFILE_BADGES',
				)
				if (!descriptor || descriptor.configurable === false) {
					plugin.reportError(
						new Error('Discord badge limit cannot be updated on this version'),
					)
					return
				}
				const original = module.MAX_DISPLAYED_PROFILE_BADGES
				Object.defineProperty(module, 'MAX_DISPLAYED_PROFILE_BADGES', {
					configurable: true,
					enumerable: descriptor.enumerable,
					get: () =>
						jsonStorage.cache?.showAll ? Number.MAX_SAFE_INTEGER : original,
				})
				cleanup(() =>
					Object.defineProperty(
						module,
						'MAX_DISPLAYED_PROFILE_BADGES',
						descriptor,
					),
				)
			},
		),
	)

	cleanup(
		getModules(
			withProps<PendingBadges>(
				'setPendingBadgeDisplayOrder',
				'setPendingBadgeVisibility',
			),
			module => {
				cleanup(
					instead(
						module,
						'setPendingBadgeDisplayOrder',
						function (args, original) {
							const order = args[0]
							if (!Array.isArray(order) || !order.some(isCustomBadgeId))
								return Reflect.apply(original, this, args)
							const userId = currentUser?.getCurrentUser()?.id
							if (
								userId &&
								order.every(
									id =>
										typeof id === 'string' ||
										(typeof id === 'number' && Number.isFinite(id)),
								)
							) {
								jsonStorage
									.set({ badgeOrder: { [userId]: order } })
									.catch(error => plugin.reportError(error))
							}
						},
					),
				)
				cleanup(
					instead(
						module,
						'setPendingBadgeVisibility',
						function (args, original) {
							const options = args[0]
							if (!isRecord(options)) return Reflect.apply(original, this, args)
							if (isCustomBadgeId(options.badgeId)) return
							return Reflect.apply(original, this, [
								{
									...options,
									reorderableBadgeIds: Array.isArray(
										options.reorderableBadgeIds,
									)
										? options.reorderableBadgeIds.filter(
												id => !isCustomBadgeId(id),
											)
										: options.reorderableBadgeIds,
									hiddenBadgeIds: Array.isArray(options.hiddenBadgeIds)
										? options.hiddenBadgeIds.filter(id => !isCustomBadgeId(id))
										: options.hiddenBadgeIds,
								},
							])
						},
					),
				)
			},
		),
	)

	cleanup(
		getModules(
			withProps<{
				fetchBadge(...args: unknown[]): unknown
				fetchBadgeSummary(...args: unknown[]): unknown
			}>('fetchBadge', 'fetchBadgeSummary'),
			module => {
				for (const method of ['fetchBadge', 'fetchBadgeSummary'] as const) {
					cleanup(
						instead(module, method, function (args, original) {
							return isCustomBadgeId(args[0])
								? Promise.resolve()
								: Reflect.apply(original, this, args)
						}),
					)
				}
			},
		),
	)

	return function profileProps(props: Record<string, unknown>) {
		if (typeof props.userId !== 'string') return props
		return {
			...props,
			badges: Array.isArray(props.badges)
				? ordered(
						store.addBadges(props.badges, props.userId),
						props.userId,
						'id',
					)
				: props.badges,
			catalogBadges: Array.isArray(props.catalogBadges)
				? addCatalog(props.catalogBadges, props.userId)
				: props.catalogBadges,
			style: jsonStorage.cache?.showAll
				? [props.style, { flexWrap: 'wrap', rowGap: 4, flexShrink: 1 }]
				: props.style,
		}
	}
}
