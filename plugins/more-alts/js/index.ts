import { installAccountActions } from './lib/accountActions'
import patchNativeSwitcher from './patches/nativeSwitcher'
import patchTabBarLongPress from './patches/tabBarLongPress'
import Settings from './ui/Settings'
import { DEFAULT_STORAGE, type MoreAltsStorage } from './lib/types'

export default plugin<{ jsonStorage: MoreAltsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULT_STORAGE,
	},

	start(api) {
		installAccountActions(
			dispose => api.cleanup(dispose),
			error => api.plugin.reportError(error),
		)
		if (api.plugin?.startedLate) {
			try {
				api.plugin.requireReload()
			} catch {}
		}

		const everest =
			(api as any).unscoped?.everest ??
			(api as any).unscoped?.roselib ??
			(valenced as any)?.everest ??
			(valenced as any)?.roselib ??
			(globalThis as any)?.__everest ??
			(globalThis as any)?.__roselib
		everest?.setActivePlugin?.(api.plugin?.manifest?.id ?? 'wolfie.more-alts')
		everest?.registerPlugin?.({
			id: api.plugin?.manifest?.id ?? 'wolfie.more-alts',
			name: api.plugin?.manifest?.name ?? 'More Alts',
			icon: api.plugin?.manifest?.icon ?? 'UserMultipleIcon',
			author: api.plugin?.manifest?.author ?? 'Rosie',
			description: api.plugin?.manifest?.description ?? '',
			version: api.plugin?.manifest?.version,
			getStatus: () => ('status' in api.plugin ? api.plugin.status : undefined),
			getErrors: () => api.plugin?.errors,
		})

		let unpatchNative = () => {}
		try {
			unpatchNative = patchNativeSwitcher(api.jsonStorage)
		} catch (e) {
			api.logger?.error(`[MoreAlts] Failed to apply native switcher patch: ${e}`)
		}

		let unpatchLongPress = () => {}
		try {
			unpatchLongPress = patchTabBarLongPress(api.jsonStorage)
		} catch (e) {
			api.logger?.error(`[MoreAlts] Failed to apply tab bar long press patch: ${e}`)
		}

		api.cleanup(() => {
			unpatchNative()
			unpatchLongPress()
		})
	},

	SettingsComponent: Settings,
})
