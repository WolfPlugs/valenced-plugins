export type MemoQuestMenu = { type: (...args: unknown[]) => unknown }

export function isMemoQuestMenu(
	value: unknown,
	name = 'QuestContextMenu',
): value is MemoQuestMenu {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		typeof value.type === 'function' &&
		value.type.name === name
	)
}
