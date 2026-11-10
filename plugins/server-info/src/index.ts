import { patchGuildsBarContextMenu } from './lib/contextMenu'
import { initModules } from './lib/modules'

export default plugin({
	start({ cleanup, plugin, unscoped }) {
		const library = initModules(unscoped, error => plugin.reportError(error))
		library?.setActivePlugin?.(plugin.manifest.id)
		library?.registerPlugin?.({
			id: plugin.manifest.id,
			name: plugin.manifest.name,
			icon: plugin.manifest.icon,
			author: plugin.manifest.author,
			description: plugin.manifest.description,
			version: plugin.manifest.version,
			getStatus: () => ('status' in plugin ? plugin.status : undefined),
			getErrors: () => plugin.errors,
		})
		cleanup(patchGuildsBarContextMenu())
		if (plugin.startedLate) plugin.requireReload()
	},
})
