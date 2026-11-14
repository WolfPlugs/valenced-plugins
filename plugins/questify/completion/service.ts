import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'
import { AppState } from 'react-native'
import { currentAccount, readQuests, refreshQuests } from '../quests/store'
import { defaults } from '../settings/config'
import { completionAllowed } from '../settings/warning-policy'
import { completeActivityAchievement } from './achievement'
import { createCompletionController } from './controller'
import { sendDesktopHeartbeat } from './desktop-heartbeat'
import { callQuestAction } from './requests'
import type { Settings } from '../settings/config'

let settings = defaults
let reportRequestError: ((error: unknown) => void) | undefined
export function setCompletionErrorReporter(
	reporter?: (error: unknown) => void,
) {
	reportRequestError = reporter
}
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
// Any voice channel works as the stream key target, same as the desktop quest scripts.
function activityStreamKey(): string {
	const channels = Stores.ChannelStore as
		| { getSortedPrivateChannels?(): { id: string }[] }
		| undefined
	const id = channels?.getSortedPrivateChannels?.()[0]?.id
	if (!id)
		throw new Error('Open a DM or voice channel before starting this quest.')
	return `call:${id}:1`
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
async function request(stage: string, action: () => Promise<unknown>) {
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
	} catch (error) {
		// Report only the formatted error, never request headers or raw responses.
		const message =
			error instanceof Error ? error.message : 'Quest request failed.'
		reportRequestError?.(new Error(`[Questify ${stage}] ${message}`))
		throw error
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
		task.name.startsWith('WATCH_VIDEO') ? !!actions() : !!task.applicationId,
	options: () => settings,
	now: () => performance.now(),
	wallNow: () => Date.now(),
	wait,
	video: (id, progress) =>
		request('video progress', async () => {
			const api = actions()
			if (!api)
				throw new Error('Quest actions are unavailable. Open Quests first.')
			await callQuestAction(() => api.updateVideoProgress(id, progress))
			const task = readQuests()
				.quests.find(quest => quest.id === id)
				?.tasks.find(task => task.name.startsWith('WATCH_VIDEO'))
			if (task && progress >= task.target)
				await request('quest refresh', refreshQuests)
		}),
	achievement: async (quest, task, active) => {
		if (!task.applicationId) throw new Error('Quest Activity is unavailable.')
		try {
			await completeActivityAchievement(
				task.applicationId,
				quest.id,
				task.target,
				active,
			)
		} catch (error) {
			reportRequestError?.(error)
			if (active())
				ToastActionCreators.open('QUESTIFY_ACHIEVEMENT_ERROR', {
					text:
						error instanceof Error
							? error.message
							: 'Activity achievement failed.',
					variant: 'critical',
				})
			throw error
		}
		if (!active()) return
		for (let attempt = 0; attempt < 3 && active(); attempt++) {
			await request('quest refresh', refreshQuests)
			const current = readQuests().quests.find(item => item.id === quest.id)
			if (current?.status === 'completed' || current?.status === 'claimed') {
				if (active())
					ToastActionCreators.open('QUESTIFY_ACHIEVEMENT_DONE', {
						text: 'Achievement complete. Claim your reward in Discord.',
					})
				return
			}
			if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500))
		}
	},
	heartbeat: (questId, applicationId, taskName, terminal) =>
		request(taskName, async () => {
			const auth = lookupModuleWithImportedPath<{
				default: { getToken(): string | null }
			}>('stores/AuthenticationStore.tsx')[0]?.default
			const token = auth?.getToken()
			if (!token)
				throw new Error('Sign in to Discord before starting this quest.')
			await sendDesktopHeartbeat(
				(...args) => callNativeMethod('wolfie.questify.heartbeat', args),
				questId,
				applicationId,
				terminal,
				token,
				taskName === 'PLAY_ACTIVITY' ? activityStreamKey() : undefined,
			)
			await request('quest refresh', refreshQuests)
		}),
})
