import { parseQuests } from './model'
import type { Quest } from './model'

export type QuestFilters = {
	hideFinished: boolean
	ignored: string[]
	hideNonCompletable?: boolean
}

export function questVisible(
	quest: Quest,
	settings: QuestFilters,
	canComplete: (quest: Quest) => boolean,
	now = Date.now(),
) {
	if (settings.ignored.includes(quest.id)) return false
	if (
		settings.hideFinished &&
		(quest.status === 'claimed' || quest.expiresAt <= now)
	)
		return false
	return !settings.hideNonCompletable || canComplete(quest)
}

function filterList(
	list: unknown[],
	settings: QuestFilters,
	now: number,
	canComplete: (quest: Quest) => boolean,
) {
	const filtered = list.filter(item => {
		const quest = parseQuests([item], now)[0]
		return !quest || questVisible(quest, settings, canComplete, now)
	})
	return filtered.length === list.length ? list : filtered
}

export function filterNativeQuestResult(
	result: unknown,
	settings: QuestFilters,
	now = Date.now(),
	canComplete: (quest: Quest) => boolean = () => false,
) {
	if (typeof result !== 'object' || result === null) return result
	let filtered = result
	for (const key of ['quests', 'excludedQuests', 'claimedQuests']) {
		if (!(key in filtered)) continue
		const list: unknown = Reflect.get(filtered, key)
		if (!Array.isArray(list)) continue
		const next = filterList(list, settings, now, canComplete)
		if (next !== list) filtered = { ...filtered, [key]: next }
	}
	return filtered
}
