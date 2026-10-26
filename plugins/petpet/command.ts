import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

type BuiltInCommands = {
	getBuiltInCommands(type: unknown, ...args: unknown[]): unknown[]
}

export function registerPetPet(
	cleanup: (dispose: () => void) => unknown,
	execute: (args: unknown, context: unknown) => Promise<void>,
) {
	return getModules(
		withProps<BuiltInCommands>('getBuiltInCommands'),
		module => {
			let builtIns: unknown[]
			try {
				builtIns = module.getBuiltInCommands(1, true, false)
			} catch {
				builtIns = module.getBuiltInCommands([1], true, false)
			}
			const ids = builtIns.flatMap(command => {
				if (
					typeof command !== 'object' ||
					command === null ||
					!('id' in command) ||
					typeof command.id !== 'string'
				)
					return []
				const id = Number(command.id)
				return Number.isSafeInteger(id) ? [id] : []
			})
			const description =
				'Create a local PetPet GIF and attach it to your message draft.'
			const command = {
				id: String(Math.min(-1, ...ids) - 1),
				name: 'petpet',
				displayName: 'petpet',
				untranslatedName: 'petpet',
				description,
				displayDescription: description,
				untranslatedDescription: description,
				applicationId: '-1',
				inputType: 1,
				type: 1,
				options: [
					{
						name: 'user',
						displayName: 'user',
						description: 'User whose avatar to pet.',
						displayDescription: 'User whose avatar to pet.',
						type: 6,
						required: true,
					},
				],
				execute,
			}
			cleanup(
				instead(module, 'getBuiltInCommands', ([type, ...args], original) => {
					const result = original(type, ...args)
					if (Array.isArray(type) ? type.includes(1) : type === 1)
						return [...result, command]
					return result
				}),
			)
		},
		{ max: 1 },
	)
}
