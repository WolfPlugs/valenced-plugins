import { NetInfo } from '@valenced/externals/react-native-community'
import { getJsonStorage } from '@valenced/json-storage'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { React, ReactJSXRuntime } from '@valenced/react'
import { useSyncExternalStore } from 'react'
import {
	createBadgeStore,
	DefaultSettings,
	isRecord,
	parseBadges,
} from './badges'
import SettingsComponent from './settings'
import { setupBadgeViewer } from './viewer'
import type { JsonStorage } from '@valenced/json-storage'
import type { PluginApi } from '@valenced/plugins/types'
import type { AnyObject } from '@valenced/utils/types'
import type { Settings } from './badges'

const RefreshInterval = 30 * 60 * 1000

type UseBadges = (user: { userId: string } | null) => unknown[]

let controller: AbortController | undefined
let active = true
let fetching = false
let timeout: ReturnType<typeof setTimeout> | undefined

async function fetchBadges(
	jsonStorage: JsonStorage<Settings>,
	cacheStorage: JsonStorage<AnyObject>,
): Promise<AnyObject> {
	const requestController = new AbortController()
	controller = requestController
	timeout = setTimeout(() => requestController.abort(), 30_000)

	const storage = await jsonStorage.get()
	const netInfo = await NetInfo.fetch()
	let cached: AnyObject | undefined
	try {
		const json = await cacheStorage.get()
		parseBadges(json)
		cached = json
	} catch {}

	if (netInfo.details?.isConnectionExpensive && !storage.updateOnMetered)
		return cached ?? { users: {} }
	if (cached && Date.now() - (storage.lastFetched ?? 0) < RefreshInterval)
		return cached

	const response = await fetch('https://badges.equicord.org/users', {
		signal: requestController.signal,
		cache: 'no-cache',
	})

	if (!response.ok) throw new Error(`Badge service returned ${response.status}`)

	const json = await response.json()
	parseBadges(json)
	await cacheStorage.set(json, true)
	await jsonStorage.set({ lastFetched: Date.now() })
	return json
}

async function refresh(
	jsonStorage: JsonStorage<Settings>,
	cacheStorage: JsonStorage<AnyObject>,
	plugin: PluginApi<{ jsonStorage: Settings }>['plugin'],
	store: ReturnType<typeof createBadgeStore>,
) {
	if (fetching || !active) return
	fetching = true

	try {
		const json = await fetchBadges(jsonStorage, cacheStorage)
		const users = parseBadges(json)
		if (active) store.setUsers(users)
	} catch (error) {
		if (active) plugin.reportError(error)
	} finally {
		clearTimeout(timeout)
		fetching = false
	}
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start(api) {
		const { cleanup, jsonStorage, plugin } = api
		active = true
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const cacheStorage = getJsonStorage(
			`${pluginStorageDirFor(plugin.manifest.id)}/cache.json`,
		)

		const store = createBadgeStore()
		const profileProps = setupBadgeViewer(api, store)

		const syncSettings = () => {
			const value = jsonStorage.cache
			store.setSettings({
				left: value?.left === true,
				showAll: value?.showAll === true,
				badgeOrder: value?.badgeOrder ?? {},
				showModStyle:
					value?.showModStyle === 'prefix' || value?.showModStyle === 'suffix'
						? value.showModStyle
						: 'none',
				providers: value?.providers ?? {},
			})
		}

		cleanup(() => {
			active = false
			controller?.abort()
			clearTimeout(timeout)
		})

		syncSettings()
		cleanup(
			jsonStorage.subscribe(update => {
				syncSettings()
				if ('updateOnMetered' in update)
					void refresh(jsonStorage, cacheStorage, plugin, store)
			}),
		)

		cleanup(
			getModules(
				withName<UseBadges>('useBadges'),
				module => {
					if (
						!active ||
						!('default' in module) ||
						typeof module.default !== 'function'
					)
						return
					cleanup(
						instead(module, 'default', function (args, original) {
							useSyncExternalStore(store.subscribe, store.getSnapshot)
							const result = Reflect.apply(original, this, args)
							const user = args[0]
							return user?.userId && Array.isArray(result)
								? store.addBadges(result, user.userId)
								: result
						}),
					)
				},
				{ returnNamespace: true, max: Infinity },
			),
		)

		function badgeProps(props: unknown) {
			if (!isRecord(props) || typeof props.id !== 'string') return
			const custom = store.getProps(props.id)
			if (custom) return { ...props, ...custom }
		}

		function patchBadgeProps<Args extends [unknown, unknown?, ...unknown[]]>(
			args: Args,
		): Args {
			const component = args[0]
			const type = isRecord(component) ? component.type : component
			const name = typeof type === 'function' ? type.name : undefined
			if (name === 'ProfileBadgeRows' && isRecord(args[1])) {
				args[1] = profileProps(args[1])
				return args
			}
			if (name !== 'ProfileBadge') return args
			const props = badgeProps(args[1])
			if (props) args[1] = props
			return args
		}

		cleanup(
			before(ReactJSXRuntime, 'jsx', patchBadgeProps),
			before(ReactJSXRuntime, 'jsxs', patchBadgeProps),
			before(React, 'createElement', patchBadgeProps),
		)

		const update = () => refresh(jsonStorage, cacheStorage, plugin, store)
		update()
		const interval = setInterval(update, RefreshInterval)
		cleanup(() => clearInterval(interval))
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
