import { beforeEach, describe, expect, mock, test } from 'bun:test'
import type {
	GuildMenuItem,
	GuildMenuModule,
} from '../plugins/server-info/src/lib/guildMenu'

// Discord's module loader and patcher only exist inside the app.
const currentPath =
	'modules/guilds_bar/native/utils/getGuildsBarGuildMenuItems.tsx'
const legacyPath = 'modules/guilds_bar/native/GuildsBarGuildMenu.tsx'
const callbacks = new Map<string, (module: GuildMenuModule) => void>()
function onMenu(module: GuildMenuModule) {
	callbacks.get(currentPath)?.(module)
}
const unsubscribe = mock(() => {})
const unpatch = mock(() => {})
const openSheet = mock((_guildId: string) => {})
const icon = () => null

mock.module('../plugins/server-info/src/lib/modules', () => ({
	getInfoIcon: () => icon,
}))
mock.module('@valenced/discord/utils/modules/finders', () => ({
	getModuleWithImportedPath: (
		path: string,
		callback: (module: GuildMenuModule) => void,
	) => {
		callbacks.set(path, callback)
		return unsubscribe
	},
}))
mock.module('../plugins/server-info/src/ui/openServerInfoSheet', () => ({
	openServerInfoSheet: openSheet,
}))
mock.module('@valenced/patcher', () => ({
	instead: (
		module: GuildMenuModule,
		key: 'default',
		patch: (
			this: unknown,
			args: unknown[],
			original: GuildMenuModule['default'],
		) => GuildMenuItem[],
	) => {
		const original = module[key]
		module[key] = function (...args) {
			return patch.call(this, args, original)
		}
		return () => {
			module[key] = original
			unpatch()
		}
	},
}))
const { patchGuildsBarContextMenu } = await import(
	'../plugins/server-info/src/lib/contextMenu'
)

beforeEach(() => {
	callbacks.clear()
	unsubscribe.mockClear()
	unpatch.mockClear()
	openSheet.mockClear()
})

describe('Server Info guild menu', () => {
	test('supports the current menu path and the older path without patching the same module twice', () => {
		const module: GuildMenuModule = { default: () => [] }
		const cleanup = patchGuildsBarContextMenu()
		expect(callbacks.has(currentPath)).toBe(true)
		expect(callbacks.has(legacyPath)).toBe(true)
		onMenu(module)
		const patched = module.default
		callbacks.get(legacyPath)?.(module)
		expect(module.default).toBe(patched)
		cleanup()
		expect(unpatch).toHaveBeenCalledTimes(1)
	})
	test('patches the legacy menu path when that is the available module', () => {
		const module: GuildMenuModule = { default: () => [] }
		const cleanup = patchGuildsBarContextMenu()
		callbacks.get(legacyPath)?.(module)
		expect(module.default('123')?.[0]?.label).toBe('Server Info')
		cleanup()
	})
	test('inserts the action after the first item without mutating the original menu', () => {
		const items = [{ label: 'Original' }]
		const module = { default: () => items }
		const cleanup = patchGuildsBarContextMenu()
		onMenu(module)
		const result = module.default('123')
		expect(result.map(item => item.label)).toEqual(['Original', 'Server Info'])
		expect(items).toHaveLength(1)
		expect(result[1].IconComponent).toBe(icon)
		result[1].action?.()
		expect(openSheet).toHaveBeenCalledWith('123')
		cleanup()
	})
	test('keeps an existing Server Info entry', () => {
		const module: GuildMenuModule = {
			default: () => [{ label: 'Server Info' }],
		}
		const cleanup = patchGuildsBarContextMenu()
		onMenu(module)
		expect(module.default('123')).toHaveLength(1)
		cleanup()
	})
	test('leaves menus without a guild ID alone and preserves the receiver', () => {
		const module = {
			label: 'Original',
			default(this: { label: string }, ..._args: unknown[]) {
				return [{ label: this.label }]
			},
		}
		const cleanup = patchGuildsBarContextMenu()
		onMenu(module)
		expect(module.default()).toEqual([{ label: 'Original' }])
		cleanup()
	})
	test('unsubscribes and restores the menu on stop', () => {
		const original = () => []
		const module = { default: original }
		const cleanup = patchGuildsBarContextMenu()
		onMenu(module)
		cleanup()
		expect(unsubscribe).toHaveBeenCalledTimes(2)
		expect(unpatch).toHaveBeenCalledTimes(1)
		expect(module.default).toBe(original)
	})
	test('can stop before the menu module loads', () => {
		patchGuildsBarContextMenu()()
		expect(unsubscribe).toHaveBeenCalledTimes(2)
		expect(unpatch).not.toHaveBeenCalled()
	})
})
