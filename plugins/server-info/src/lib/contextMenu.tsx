import { instead } from '@valenced/patcher'
import { openServerInfoSheet } from '../ui/openServerInfoSheet'
import { waitForGuildsBarGuildMenu } from './guildMenu'
import { getInfoIcon } from './modules'

const MENU_LABEL = 'Server Info'

export function patchGuildsBarContextMenu(): () => void {
	const unpatches: Array<() => void> = []

	const unsub = waitForGuildsBarGuildMenu(ns => {
		if (typeof ns?.default !== 'function') return

		unpatches.push(
			instead(ns, 'default', function (args, original) {
				const items = [...(original.apply(this, args) ?? [])]
				const guildId = typeof args?.[0] === 'string' ? args[0] : undefined

				if (guildId != null) {
					if (!items.some(item => item?.label === MENU_LABEL)) {
						items.splice(1, 0, {
							IconComponent: getInfoIcon(),
							label: MENU_LABEL,
							action: () => openServerInfoSheet(guildId),
						})
					}
				}

				return items
			}),
		)
	})

	return () => {
		unsub()
		for (const unpatch of unpatches) unpatch()
	}
}
