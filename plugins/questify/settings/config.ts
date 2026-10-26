export const QuestTypes = {
	WATCH_VIDEO: 'Video quests',
	WATCH_VIDEO_ON_MOBILE: 'Mobile video quests',
	PLAY_ON_DESKTOP: 'Desktop play quests',
	PLAY_ACTIVITY: 'Activity play quests',
}
export type Settings = {
	warningVersion: number
	autoCompletionAllowed: boolean
	notifyCompletion: boolean
	hideFinished: boolean
	expiringFirst: boolean
	ignored: string[]
	hideNonCompletable: boolean
	accelerateVideo: boolean
	preventVideoPausing: boolean
	simultaneous: boolean
	resumeInterrupted: boolean
	autoTypes: Record<string, boolean>
	resumeByAccount: Record<string, { updatedAt: number; questIds: string[] }>
}
export const defaults: Settings = {
	warningVersion: 0,
	autoCompletionAllowed: false,
	notifyCompletion: true,
	hideFinished: true,
	expiringFirst: true,
	ignored: [],
	hideNonCompletable: false,
	accelerateVideo: false,
	preventVideoPausing: false,
	simultaneous: false,
	resumeInterrupted: false,
	autoTypes: {},
	resumeByAccount: {},
}
export function normalizeSettings(
	value: Partial<Settings> | undefined,
): Settings {
	return {
		...defaults,
		...value,
		autoTypes: value?.autoTypes ?? {},
		resumeByAccount: value?.resumeByAccount ?? {},
	}
}
