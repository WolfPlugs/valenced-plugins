import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'

export interface GuildMenuItem {
	label?: string
	IconComponent?: unknown
	action?: () => void
}

export interface GuildMenuModule {
	default: (...args: unknown[]) => GuildMenuItem[] | undefined
}

const MENU_PATHS = [
	'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx',
	'modules/guilds_bar/native/GuildsBarGuildMenu.tsx',
]

export function waitForGuildsBarGuildMenu(
	callback: (namespace: GuildMenuModule) => void,
): () => void {
	const seen = new WeakSet<GuildMenuModule>()
	const subscriptions = MENU_PATHS.map(path =>
		getModuleWithImportedPath<GuildMenuModule>(path, namespace => {
			if (seen.has(namespace)) return
			seen.add(namespace)
			callback(namespace)
		}),
	)
	return () => {
		for (const unsubscribe of subscriptions) unsubscribe()
	}
}
