import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { logOutSessions } from './lib/logout'
import {
	getOwner,
	getSessionActions,
	getSessions,
	SessionActionsPath,
	SessionsStorePath,
} from './lib/modules'
import { createSessionTracker, defaults } from './lib/sessions'
import { installPatches } from './patches'
import { dismissLogoutConfirmation } from './ui/DevicesView'
import type { SessionActions, SessionsStore } from './lib/modules'
import type { SessionsStorage } from './lib/sessions'
import type { DeviceController } from './ui/context'

const FirstFetchMs = 6_000
const RefreshIntervalMs = 15 * 60 * 1_000

export default plugin<{ jsonStorage: SessionsStorage }>({
	jsonStorage: { load: true, default: defaults },
	start({ cleanup, jsonStorage, plugin }) {
		let active = true
		let ready = false
		let refreshing = false
		let currentHash: string | undefined
		let owner = getOwner()
		const reportError = (error: unknown) => {
			if (active) plugin.reportError(error)
		}
		const tracker = createSessionTracker(jsonStorage.cache, state => {
			void jsonStorage.set(state, true).catch(reportError)
		})
		tracker.setOwner(owner)
		function readSessions() {
			const nextOwner = getOwner()
			if (nextOwner !== owner) {
				owner = nextOwner
				currentHash = undefined
				ready = false
				tracker.setOwner(owner)
			}
			return getSessions().map(session => ({
				...session,
				current: session.current === true || session.id_hash === currentHash,
			}))
		}
		function onChange() {
			try {
				const sessions = readSessions()
				if (active && ready && owner) tracker.handle(sessions, owner)
			} catch (error) {
				reportError(error)
			}
		}
		async function refresh() {
			if (!active || refreshing) return
			const actions = getSessionActions()
			const fetchingOwner = getOwner()
			if (!actions || !fetchingOwner) return
			refreshing = true
			try {
				await actions.fetchAuthSessions()
				if (!active || fetchingOwner !== getOwner()) return
				readSessions()
				ready = true
				onChange()
			} finally {
				refreshing = false
			}
		}
		const poll = () => {
			void refresh().catch(reportError)
		}
		const controller: DeviceController = {
			tracker,
			getCurrentHash: () => currentHash,
			reportError,
			async logout(hashes) {
				const actions = getSessionActions()
				const logoutOwner = getOwner()
				if (!active || !actions || !logoutOwner)
					throw new Error('Discord session actions are unavailable')
				return logOutSessions({
					hashes,
					getSessions: readSessions,
					request: hashes => actions.logOutSessions(hashes),
					refresh,
					reportError,
					isActive: () => active && logoutOwner === getOwner(),
				})
			},
		}
		cleanup(() => {
			active = false
			dismissLogoutConfirmation()
		})
		cleanup(
			getModuleWithImportedPath<{ default: SessionsStore }>(
				SessionsStorePath,
				({ default: store }) => {
					store.addChangeListener(onChange)
					cleanup(() => store.removeChangeListener(onChange))
				},
			),
		)
		cleanup(
			getModuleWithImportedPath<SessionActions>(SessionActionsPath, () => {
				const timer = setTimeout(poll, FirstFetchMs)
				cleanup(() => clearTimeout(timer))
			}),
		)
		const interval = setInterval(poll, RefreshIntervalMs)
		cleanup(() => clearInterval(interval))
		installPatches({
			cleanup,
			controller,
			setCurrentHash(hash) {
				currentHash = hash
			},
		})
		if (plugin.startedLate) plugin.requireReload()
	},
})
