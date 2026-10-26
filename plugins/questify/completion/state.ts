import { QuestTypes } from '../settings/config'
import type { Quest } from '../quests/model'
import type { Settings } from '../settings/config'

export function shouldAutoComplete(quest: Quest, settings: Settings): boolean {
	return (
		quest.status === 'active' &&
		!settings.ignored.includes(quest.id) &&
		quest.tasks.some(
			task =>
				task.name in QuestTypes &&
				settings.autoTypes[task.name] === true &&
				task.progress < task.target,
		)
	)
}

export function savedQuestIds(
	settings: Settings,
	account: string | undefined,
): string[] {
	return settings.resumeInterrupted && account
		? (settings.resumeByAccount[account]?.questIds ?? [])
		: []
}
export function resumableQuests(ids: string[], quests: Quest[]): Quest[] {
	const saved = new Set(ids)
	return quests.filter(
		quest => saved.has(quest.id) && quest.status === 'active',
	)
}
