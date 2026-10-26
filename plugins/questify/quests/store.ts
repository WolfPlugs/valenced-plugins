import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { parseQuests } from './model'

type MobileQuestStore = {
	getQuest(id: string): unknown
	getQuestConfig(id: string): unknown
	quests: unknown
	claimedQuests?: unknown
}

export function readQuests() {
	const [store] = lookupModule(
		withProps<MobileQuestStore>('getQuest', 'getQuestConfig'),
	)
	if (!store) return { available: false, quests: [] }
	const quests = new Map(
		[...parseQuests(store.claimedQuests), ...parseQuests(store.quests)].map(
			quest => [quest.id, quest],
		),
	)
	return { available: true, quests: [...quests.values()] }
}

export function currentAccount() {
	const [users] = lookupModule(
		withProps<{ getCurrentUser: () => { id: string } | undefined }>(
			'getCurrentUser',
		),
	)
	return users?.getCurrentUser()?.id
}

export async function refreshQuests() {
	const [actions] = lookupModule(
		withProps<{
			fetchCurrentQuests(): Promise<unknown>
			enrollInQuest: unknown
			updateVideoProgress: unknown
		}>('fetchCurrentQuests', 'enrollInQuest', 'updateVideoProgress'),
	)
	if (!actions)
		throw new Error(
			'Quest actions are not loaded. Open Discord’s Quests screen first.',
		)
	await actions.fetchCurrentQuests()
}
