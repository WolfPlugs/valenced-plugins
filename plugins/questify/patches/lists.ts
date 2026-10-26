import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { completion } from '../completion/service'
import { filterNativeQuestResult } from '../quests/filtering'
import type { QuestFilters } from '../quests/filtering'

type QuestHooks = {
	useFilteredQuests: (...args: unknown[]) => unknown
	useClaimedQuests: (...args: unknown[]) => unknown
}

export function patchQuestLists(
	cleanup: (fn: () => void) => void,
	useSettings: () => QuestFilters,
) {
	cleanup(
		getModules(
			withProps<QuestHooks>('useFilteredQuests', 'useClaimedQuests'),
			hooks => {
				for (const key of [
					'useFilteredQuests',
					'useClaimedQuests',
				] satisfies (keyof QuestHooks)[]) {
					cleanup(
						instead(hooks, key, function (args, original) {
							const settings = useSettings()
							const result = Reflect.apply(original, this, args)
							return filterNativeQuestResult(
								result,
								settings,
								Date.now(),
								completion.canComplete,
							)
						}),
					)
				}
			},
			{ max: Infinity },
		),
	)
}
