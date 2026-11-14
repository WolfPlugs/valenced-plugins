import { expect, test } from 'bun:test'
import { createCompletionController } from '../plugins/questify/completion/controller'
import type { Quest } from '../plugins/questify/quests/model'

test('Activity achievements use their own action and require server confirmation', async () => {
	for (const confirmed of [false, true]) {
		const quest: Quest = {
			id: '12345',
			name: 'Activity',
			expiresAt: Infinity,
			status: 'active',
			tasks: [
				{
					name: 'ACHIEVEMENT_IN_ACTIVITY',
					progress: 0,
					target: 1,
					applicationId: '67890',
				},
			],
		}
		let submitted = 0
		const controller = createCompletionController({
			account: () => 'account',
			foreground: () => true,
			quest: () => quest,
			supports: () => true,
			video: async () => {
				throw new Error('Wrong video route')
			},
			heartbeat: async () => {
				throw new Error('Wrong heartbeat route')
			},
			achievement: async () => {
				submitted++
				if (confirmed) quest.status = 'completed'
			},
			now: () => 0,
			wait: async () => {},
		})
		controller.start()
		controller.queue(quest)
		await Bun.sleep(0)
		expect(submitted).toBe(1)
		expect(controller.state(quest.id)?.kind).toBe(
			confirmed ? 'completed' : 'error',
		)
	}
})
