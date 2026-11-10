import { onFluxEventDispatched } from '@valenced/discord/flux'
import { createEventHandlers } from './lib/events'
import { installHistorySync } from './lib/historySync'
import { createInbox } from './lib/inbox'
import { getOwner, getStores } from './lib/modules'
import { DEFAULT_STORAGE } from './lib/types'
import { installPatches } from './patches'
import { InboxContext } from './ui/context'
import { closeInboxSheets } from './ui/openInbox'
import Settings from './ui/Settings'
import type { EventPayload } from './lib/discordTypes'
import type { BetterInboxStorage } from './lib/types'
import type { InboxController } from './ui/context'

let controller: InboxController | undefined

export default plugin<{ jsonStorage: BetterInboxStorage }>({
	jsonStorage: { load: true, default: DEFAULT_STORAGE },
	start({ jsonStorage, cleanup, plugin }) {
		const reportError = (error: unknown) => plugin.reportError(error)
		const inbox = createInbox({
			read: () => jsonStorage.cache,
			save: state => jsonStorage.set(state),
			reportError,
			owner: getOwner(),
		})
		controller = { inbox, storage: jsonStorage, reportError }
		const handlers = createEventHandlers({
			stores: getStores,
			getSettings: () => jsonStorage.cache,
			pushNotification: inbox.push,
			reportError,
		})
		let owner = getOwner()
		function syncOwner() {
			const next = getOwner()
			if (next === owner) return
			owner = next
			inbox.setOwner(next)
			handlers.reset()
			// Store listeners may run during a Flux dispatch. Dismiss sheets afterward.
			void Promise.resolve().then(closeInboxSheets).catch(reportError)
		}
		cleanup(() => {
			controller = undefined
			void inbox.stop()
			closeInboxSheets()
		})
		for (const [event, handler] of Object.entries(handlers.events)) {
			cleanup(
				onFluxEventDispatched<EventPayload>(event, payload => {
					try {
						syncOwner()
						handler(payload)
					} catch (error) {
						reportError(error)
					}
					return payload
				}),
			)
		}
		const users = getStores().UserStore
		// Account changes must clear the visible feed even before another notification arrives.
		if (users) {
			users.addChangeListener(syncOwner)
			cleanup(() => users.removeChangeListener(syncOwner))
		}
		controller.refreshHistory = installHistorySync(
			controller,
			cleanup,
			syncOwner,
		)
		installPatches(controller, cleanup)
		if (plugin.startedLate) plugin.requireReload()
	},
	SettingsComponent() {
		if (!controller) return null
		return (
			<InboxContext.Provider value={controller}>
				<Settings />
			</InboxContext.Provider>
		)
	},
})
