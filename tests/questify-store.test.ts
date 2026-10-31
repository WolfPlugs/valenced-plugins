import { expect, mock, test } from 'bun:test'

const fetched: string[] = []
const questStore = {
	getQuest() {},
	getQuestConfig() {},
	quests: new Map([
		['123', { id: '123', config: { messages: { questName: 'Test quest' } } }],
	]),
}
mock.module('@valenced/discord/flux', () => ({ Stores: {} }))
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: (...properties: string[]) => properties,
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule: (properties: string[]) =>
		properties.includes('fetchCurrentQuests')
			? [
					{
						fetchCurrentQuests: async () => {
							fetched.push('quests')
						},
					},
				]
			: [questStore],
}))
const { readQuests, refreshQuests } = await import(
	'../plugins/questify/quests/store'
)

test('quest browsing works when the named store registry has no quest store', async () => {
	expect(readQuests().available).toBe(true)
	expect(readQuests().quests[0]?.name).toBe('Test quest')
	await refreshQuests()
	expect(fetched).toEqual(['quests'])
})
