import { expect, mock, test } from 'bun:test'
import * as React from 'react'
import type { ReactNode } from 'react'
import type { InboxController } from '../../plugins/better-inbox/src/ui/context'

type Render = (this: unknown, ...args: unknown[]) => ReactNode
const imported = new Map<string, (module: Record<string, unknown>) => void>()
mock.module('@valenced/discord/utils/modules/finders', () => ({
	getModuleWithImportedPath(
		path: string,
		callback: (module: Record<string, unknown>) => void,
	) {
		imported.set(path, callback)
		return () => imported.delete(path)
	},
}))
mock.module('@valenced/modules/finders', () => ({ getModules: () => () => {} }))
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: () => ({}),
}))
mock.module('@valenced/patcher', () => ({
	instead(
		holder: Record<string, Render>,
		key: string,
		hook: (this: unknown, args: unknown[], original: Render) => ReactNode,
	) {
		const original = holder[key]
		holder[key] = function (...args) {
			return hook.call(this, args, original)
		}
		return () => {
			holder[key] = original
		}
	},
}))
mock.module('@valenced/react', () => ({ React }))
function NotificationCenter() {
	return null
}
mock.module('../../plugins/better-inbox/src/ui/NotificationCenter', () => ({
	default: NotificationCenter,
}))
const open = mock(() => {})
mock.module('../../plugins/better-inbox/src/ui/openInbox', () => ({
	openNotificationCenter: open,
}))
const { installPatches } = await import(
	'../../plugins/better-inbox/src/patches'
)
const { InboxContext } = await import(
	'../../plugins/better-inbox/src/ui/context'
)

test('native feed replacement works independently of the bell and preserves its renderer contract', () => {
	const cleanups: (() => void)[] = []
	const errors: unknown[] = []
	const controller = {
		reportError: (error: unknown) => errors.push(error),
	} as InboxController
	installPatches(controller, callback => cleanups.push(callback))
	const native = function (this: unknown, ...args: unknown[]) {
		expect(this).toBe(memo)
		expect(args).toEqual(['props'])
		return 'native feed'
	}
	const memo = { type: native }
	const callback = imported.get(
		'modules/notification_center/native/NotificationCenterForYou.tsx',
	)
	expect(callback).toBeDefined()
	callback?.({ NotificationCenterForYou: memo })
	const result = memo.type('props')
	if (
		!React.isValidElement<{
			value: InboxController
			children: React.ReactElement
		}>(result)
	)
		throw new Error('Missing provider')
	expect(result.type).toBe(InboxContext.Provider)
	expect(result.props.value).toBe(controller)
	expect(result.props.children.type).toBe(NotificationCenter)
	expect(open).not.toHaveBeenCalled()
	for (const cleanup of cleanups.reverse()) cleanup()
	expect(memo.type).toBe(native)
	expect(imported.size).toBe(0)
	expect(errors).toEqual([])
})

test('bell settings subscription runs in a separate component, leaving native hooks untouched', () => {
	const cleanups: (() => void)[] = []
	let subscriptions = 0
	const controller = {
		storage: {
			use() {
				subscriptions++
				return { showYouBarButton: false }
			},
		},
		reportError(error: unknown) {
			throw error
		},
	} as unknown as InboxController
	installPatches(controller, callback => cleanups.push(callback))
	const nativeTree = React.createElement('NativeBell', { onPress: () => {} })
	const module = { default: () => nativeTree }
	imported.get(
		'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
	)?.(module)
	const result = module.default()
	expect(subscriptions).toBe(0)
	if (
		!React.isValidElement<{ tree: ReactNode }>(result) ||
		typeof result.type !== 'function'
	)
		throw new Error('Missing settings wrapper')
	expect(Reflect.apply(result.type, undefined, [result.props])).toBe(nativeTree)
	expect(subscriptions).toBe(1)
	for (const cleanup of cleanups.reverse()) cleanup()
})
