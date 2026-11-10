import { getStore } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { importNativeItem, readNativeHistory } from './history'
import { fetchHistory } from './historyRequest'
import { getOwner, getStores } from './modules'
import type { InboxController } from '../ui/context'
import type { NativeHistoryStore } from './history'
import type { DiscordHTTP } from './historyRequest'

function getHTTP(): DiscordHTTP {
	const [module] = lookupModule(withProps<{ HTTP: DiscordHTTP }>('HTTP'))
	if (typeof module?.HTTP?.get === 'function') return module.HTTP
	const [http] = lookupModule(
		withProps<
			DiscordHTTP & {
				post: unknown
				put: unknown
				patch: unknown
				del: unknown
			}
		>('get', 'post', 'put', 'patch', 'del'),
	)
	if (!http) throw new Error('Discord HTTP client is unavailable')
	return http
}
export function installHistorySync(
	controller: InboxController,
	cleanup: (fn: () => void) => void,
	syncOwner: () => void,
) {
	let active = true
	let scheduled = false
	let pending: Promise<void> | undefined
	let pendingOwner: string | undefined
	const sources = new Set<NativeHistoryStore>()
	cleanup(() => {
		active = false
		sources.clear()
	})
	function sync() {
		scheduled = false
		if (!active) return
		try {
			syncOwner()
			if (!getOwner()) return
			for (const source of sources)
				controller.inbox.importHistory(
					readNativeHistory(source, getStores(), controller.storage.cache),
				)
		} catch (error) {
			controller.reportError(error)
		}
	}
	function schedule() {
		if (!active || scheduled) return
		scheduled = true
		void Promise.resolve().then(sync)
	}
	async function load() {
		sync()
		const owner = getOwner()
		if (!active || !owner) return
		let http: DiscordHTTP
		try {
			http = getHTTP()
		} catch (error) {
			controller.reportError(error)
			throw error
		}
		const isActive = () => active && getOwner() === owner
		const settings = controller.storage.cache
		const receive = (values: unknown[]) => {
			if (!isActive()) return
			controller.inbox.importHistory(
				values.flatMap(value => {
					const item = importNativeItem(value, getStores(), settings)
					return item ? [item] : []
				}),
			)
		}
		const results = await Promise.allSettled(
			(['notifications', 'mentions'] as const).map(source =>
				fetchHistory({
					http,
					source,
					limit: settings?.maxStored,
					isActive,
					receive,
				}),
			),
		)
		if (!isActive()) return
		for (const result of results)
			if (result.status === 'rejected') controller.reportError(result.reason)
		if (results.some(result => result.status === 'rejected'))
			throw new Error(
				'Some notification history could not be loaded. Please try refreshing.',
			)
	}
	function refresh(): Promise<void> {
		if (!active) return Promise.resolve()
		const owner = getOwner()
		if (pending && pendingOwner === owner) return pending
		pendingOwner = owner
		const operation = load().finally(() => {
			if (pending === operation) pending = undefined
		})
		pending = operation
		return operation
	}
	for (const name of ['NotificationCenterItemsStore', 'RecentMentionsStore']) {
		cleanup(
			getStore<NativeHistoryStore>(name, store => {
				if (sources.has(store)) return
				sources.add(store)
				store.addChangeListener(schedule)
				cleanup(() => store.removeChangeListener(schedule))
				schedule()
			}),
		)
	}
	return refresh
}
