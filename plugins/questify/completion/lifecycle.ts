import { AppState } from 'react-native'
import { patchVideoFocus } from '../patches/video-focus'
import { currentAccount, readQuests, refreshQuests } from '../quests/store'
import { normalizeSettings } from '../settings/config'
import { completionAllowed } from '../settings/warning-policy'
import { completion, configureCompletion } from './service'
import { resumableQuests, savedQuestIds, shouldAutoComplete } from './state'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from '../settings/config'

export function startCompletionLifecycle(
	cleanup: (fn: () => void) => void,
	storage: JsonStorage<Settings>,
	reportError: (error: unknown) => void,
) {
	let settings = normalizeSettings(storage.cache)
	let account: string | undefined
	let pendingResume = new Set<string>()
	let lastSaved = ''
	let fetchedAccount: string | undefined
	let fetching = false
	let lastFetch = 0
	let suppressSave = false
	let writes = Promise.resolve()
	configureCompletion(settings)
	completion.start()
	function save() {
		if (suppressSave || !account) return
		const ids = settings.resumeInterrupted
			? [
					...new Set([
						...pendingResume,
						...completion
							.pending()
							.filter(entry => entry.account === account)
							.map(entry => entry.questId),
					]),
				].sort()
			: []
		const key = JSON.stringify([account, ids])
		if (key === lastSaved) return
		lastSaved = key
		const userId = account
		writes = writes
			.then(() =>
				storage.set({
					resumeByAccount: {
						[userId]: { updatedAt: Date.now(), questIds: ids },
					},
				}),
			)
			.catch(reportError)
	}
	const unsubscribeCompletion = completion.subscribe(save)
	cleanup(
		storage.subscribe(() => {
			settings = normalizeSettings(storage.cache)
			if (!settings.resumeInterrupted) pendingResume.clear()
			configureCompletion(settings)
			save()
		}),
	)
	patchVideoFocus(
		cleanup,
		() => completionAllowed(settings) && settings.preventVideoPausing,
	)
	function tick() {
		try {
			const userId = currentAccount()
			if (account !== userId) {
				suppressSave = true
				completion.check()
				suppressSave = false
				account = userId
				pendingResume = new Set(savedQuestIds(settings, account))
				lastSaved = ''
				lastFetch = 0
			}
			if (
				!account ||
				AppState.currentState !== 'active' ||
				!completionAllowed(settings)
			)
				return
			completion.check()
			const snapshot = readQuests()
			if (!snapshot.available) return
			const needsFetch =
				pendingResume.size > 0 ||
				Object.values(settings.autoTypes).some(Boolean)
			if (needsFetch && fetchedAccount !== account) {
				if (!fetching && Date.now() - lastFetch > 30000) {
					fetching = true
					lastFetch = Date.now()
					const requestAccount = account
					void refreshQuests()
						.then(() => {
							if (currentAccount() === requestAccount)
								fetchedAccount = requestAccount
						})
						.catch(() => {
							// Retry initial loading after a transient network failure or lazy action load.
						})
						.finally(() => {
							fetching = false
							tick()
						})
				}
				return
			}
			if (snapshot.quests.length === 0) return
			suppressSave = true
			try {
				for (const quest of snapshot.quests)
					if (quest.status !== 'active' && quest.status !== 'available')
						pendingResume.delete(quest.id)
				for (const quest of resumableQuests(
					[...pendingResume],
					snapshot.quests,
				)) {
					if (!completion.canQueue(quest)) continue
					pendingResume.delete(quest.id)
					if (
						!completion.state(quest.id) ||
						completion.state(quest.id)?.kind === 'stopped'
					)
						completion.queue(quest)
				}
				for (const quest of snapshot.quests) {
					if (
						shouldAutoComplete(quest, settings) &&
						!completion.state(quest.id) &&
						completion.canQueue(quest)
					)
						completion.queue(quest)
				}
			} finally {
				suppressSave = false
			}
			save()
		} catch (error) {
			suppressSave = false
			reportError(error)
		}
	}
	const appState = AppState.addEventListener('change', state => {
		if (state !== 'active') {
			if (settings.resumeInterrupted)
				for (const entry of completion.pending())
					if (entry.account === account) pendingResume.add(entry.questId)
			suppressSave = true
			completion.stopAll()
			suppressSave = false
			save()
		} else tick()
	})
	const timer = setInterval(tick, 5000)
	tick()
	cleanup(() => {
		clearInterval(timer)
		appState.remove()
		save()
		unsubscribeCompletion()
		completion.dispose()
	})
}
