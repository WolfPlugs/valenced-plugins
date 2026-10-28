import { ToastActionCreators } from '@valenced/discord/actions'
import { AppState } from 'react-native'
import { startCompletionLifecycle } from './completion/lifecycle'
import { patchQuestLists } from './patches/lists'
import { patchQuestMenu } from './patches/menus'
import { currentAccount, readQuests } from './quests/store'
import { defaults, normalizeSettings } from './settings/config'
import SettingsComponent from './settings/index'
import { scheduleStartupWarning } from './settings/warnings'
import type { QuestStatus } from './quests/model'
import type { Settings } from './settings/config'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: defaults },
	start({ cleanup, jsonStorage, plugin }) {
		scheduleStartupWarning(cleanup, jsonStorage)
		startCompletionLifecycle(cleanup, jsonStorage, error =>
			plugin.reportError(error),
		)
		patchQuestMenu(cleanup)
		if (plugin.startedLate) plugin.requireReload()
		else patchQuestLists(cleanup, () => normalizeSettings(jsonStorage.use()))
		let account: string | undefined
		let previous = new Map<string, QuestStatus>()
		const timer = setInterval(() => {
			if (AppState.currentState !== 'active') return
			try {
				const accountId = currentAccount()
				if (!accountId) {
					account = undefined
					previous.clear()
					return
				}
				const snapshot = readQuests()
				if (!snapshot.available) return
				if (accountId !== account) {
					previous.clear()
					account = accountId
				}
				for (const quest of snapshot.quests) {
					if (
						jsonStorage.cache?.notifyCompletion &&
						previous.get(quest.id) === 'active' &&
						quest.status === 'completed'
					) {
						ToastActionCreators.open(`QUESTIFY_${quest.id}`, {
							text: `${quest.name} completed. Your reward is ready to claim.`,
						})
					}
				}
				previous = new Map(
					snapshot.quests.map(quest => [quest.id, quest.status]),
				)
			} catch {
				// A missing or changed Discord store must not interrupt the client.
				previous.clear()
			}
		}, 5000)
		cleanup(() => clearInterval(timer))
	},
	stop({ plugin }) {
		plugin.requireReload()
	},
	SettingsComponent,
})
