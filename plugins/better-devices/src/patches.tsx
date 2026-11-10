import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { patchComponent } from './lib/componentPatch'
import { SessionsScreenPath, YouBarPath } from './lib/modules'
import { DeviceBadge } from './ui/DeviceBadge'
import { DevicesView } from './ui/DevicesView'
import { createScreenRenderer } from './ui/screenRenderer'
import { transformSessionTree } from './ui/sessionTree'
import type { ReactNode } from 'react'
import type { ComponentModule } from './lib/componentPatch'
import type { DeviceController } from './ui/context'

export function installPatches({
	cleanup,
	controller,
	setCurrentHash,
}: {
	cleanup(fn: () => void): void
	controller: DeviceController
	setCurrentHash(hash: string): void
}) {
	const decorate = (tree: ReactNode): ReactNode => {
		try {
			const result = transformSessionTree(tree, setCurrentHash)
			if (!result.cards) return tree
			if (!result.controlsInserted)
				throw new Error('Discord Devices screen layout is unsupported')
			return <DevicesView controller={controller}>{result.tree}</DevicesView>
		} catch (error) {
			controller.reportError(error)
			return tree
		}
	}
	const render = createScreenRenderer(decorate)
	cleanup(
		getModuleWithImportedPath<ComponentModule>(SessionsScreenPath, module => {
			try {
				cleanup(patchComponent(module, tree => render(decorate(tree))))
			} catch (error) {
				controller.reportError(error)
			}
		}),
	)
	cleanup(
		getModuleWithImportedPath<ComponentModule>(YouBarPath, module => {
			try {
				cleanup(
					patchComponent(module, tree => (
						<DeviceBadge controller={controller}>{tree}</DeviceBadge>
					)),
				)
			} catch (error) {
				controller.reportError(error)
			}
		}),
	)
}
