import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { parseQuests } from './model'
import type { DiscordModules } from '@valenced/discord/types'

type MobileQuestStore = {
	getQuest(id: string): unknown
	getQuestConfig(id: string): unknown
	quests: unknown
	claimedQuests?: unknown
}

export function readQuests() {
	const store =
		(Stores.QuestsStore as
			| DiscordModules.Flux.Store<MobileQuestStore>
			| undefined) ??
		lookupModule(withProps<MobileQuestStore>('getQuest', 'getQuestConfig'))[0]
	if (!store) return { available: false, quests: [] }
	const quests = new Map(
		[...parseQuests(store.claimedQuests), ...parseQuests(store.quests)].map(
			quest => [quest.id, quest],
		),
	)
	return { available: true, quests: [...quests.values()] }
}

export function currentAccount() {
	const users = Stores.UserStore as DiscordModules.Flux.Store<{
		getCurrentUser(): { id: string } | undefined
	}>
	return users?.getCurrentUser()?.id
}

export async function refreshQuests() {
	const [actions] = lookupModule(
		withProps<{
			fetchCurrentQuests(): Promise<unknown>
		}>('fetchCurrentQuests'),
	)
	if (!actions)
		throw new Error(
			'Quest actions are not loaded. Open Discord’s Quests screen first.',
		)
	await actions.fetchCurrentQuests()
}
