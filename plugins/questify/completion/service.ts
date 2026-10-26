import { Dispatcher } from '@valenced/discord/common/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { AppState } from 'react-native'
import { currentAccount, readQuests, refreshQuests } from '../quests/store'
import { defaults } from '../settings/config'
import { completionAllowed } from '../settings/warning-policy'
import { createCompletionController } from './controller'
import { callQuestAction, callQuestHeartbeat } from './requests'
import type { Settings } from '../settings/config'

let settings = defaults
export function configureCompletion(value: Settings) {
	settings = value
	if (!completionAllowed(settings)) completion.stopAll()
	else completion.reschedule()
}

type QuestActions = {
	enrollInQuest: unknown
	updateVideoProgress(id: string, timestamp: number): Promise<void>
	sendHeartbeat(options: {
		questId: string
		applicationId: string
		terminal: boolean
	}): Promise<void>
}
function actions() {
	return lookupModule(
		withProps<QuestActions>(
			'updateVideoProgress',
			'sendHeartbeat',
			'enrollInQuest',
		),
	)[0]
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error('Stopped.'))
			return
		}
		const abort = () => {
			clearTimeout(timer)
			signal.removeEventListener('abort', abort)
			reject(new Error('Stopped.'))
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', abort)
			resolve()
		}, ms)
		signal.addEventListener('abort', abort, { once: true })
	})
}
async function request(action: () => Promise<unknown>) {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			action(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new Error(
								'Discord request timed out. Reopen Quests before retrying.',
							),
						),
					20000,
				)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}

export const completion = createCompletionController({
	allowed: () => completionAllowed(settings),
	account: currentAccount,
	foreground: () => AppState.currentState === 'active',
	quest: id => readQuests().quests.find(quest => quest.id === id),
	supports: task =>
		!!actions() &&
		(task.name.startsWith('WATCH_VIDEO') || !!task.applicationId),
	options: () => settings,
	now: () => performance.now(),
	wallNow: () => Date.now(),
	wait,
	video: (id, progress) =>
		request(async () => {
			const api = actions()
			if (!api)
				throw new Error('Quest actions are unavailable. Open Quests first.')
			await callQuestAction(() => api.updateVideoProgress(id, progress))
			const task = readQuests()
				.quests.find(quest => quest.id === id)
				?.tasks.find(task => task.name.startsWith('WATCH_VIDEO'))
			if (task && progress >= task.target) await refreshQuests()
		}),
	heartbeat: (questId, applicationId, terminal) =>
		request(() => {
			const api = actions()
			if (!api)
				throw new Error('Quest actions are unavailable. Open Quests first.')
			return callQuestHeartbeat(Dispatcher, questId, () =>
				api.sendHeartbeat({ questId, applicationId, terminal }),
			)
		}),
})
