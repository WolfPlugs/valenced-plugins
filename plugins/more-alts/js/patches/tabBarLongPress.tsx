import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage } from '../lib/types'
import { openAccountSwitcherSheet } from '../ui/AccountSwitcherSheet'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

export default function patchTabBarLongPress(
	storage: JsonStorage<MoreAltsStorage>,
): () => void {
	const cleanups: Array<() => void> = []
	const rev = getValenced()
	const React = rev.react.React

	const patchTabItem = (target: any) => {
		const component = target?.default ?? target
		if (!component) return

		try {
			const unpatch = rev.patcher.after(
				component,
				typeof component === 'function' ? undefined : ('type' as any),
				(res: any) => {
					if (!res || !res.props) return res

					try {
						const isYouTab =
							res.props.accessibilityLabel?.toLowerCase?.().includes('you') ||
							res.props.accessibilityLabel?.toLowerCase?.().includes('profile') ||
							res.props.accessibilityLabel?.toLowerCase?.().includes('account') ||
							res.props.name === 'you' ||
							res.props.route?.name === 'you' ||
							res.props.tab?.id === 'you' ||
							res.props.id === 'you'

						if (isYouTab) {
							const originalLongPress = res.props.onLongPress

							if (
								storage.cache?.enableNativeSwitcher !== false &&
								typeof originalLongPress === 'function'
							) {
								return res
							}

							return React.cloneElement(res, {
								onLongPress: (...lpArgs: any[]) => {
									if (typeof originalLongPress === 'function') {
										try {
											originalLongPress(...lpArgs)
											return
										} catch {}
									}

									try {
										openAccountSwitcherSheet(storage)
									} catch (e) {
										console.error(
											'[MoreAlts] Failed to open switcher sheet on long press:',
											e,
										)
									}
								},
							})
						}
					} catch (e) {
						console.error('[MoreAlts] Tab item clone error:', e)
					}

					return res
				},
			)
			cleanups.push(unpatch)
		} catch (e) {
			console.error('[MoreAlts] Failed to patch tab item:', e)
		}
	}

	const tabComponentNames = [
		'TabBarItem',
		'BottomTabBarItem',
		'BottomTabItem',
		'MobileBottomTabItem',
		'TabButton',
		'BottomTabButton',
		'NavigationTabButton',
		'YouTab',
		'UserAccountTab',
	]

	for (const name of tabComponentNames) {
		try {
			const filter = Object.assign(
				(_id: any, exports: any) => {
					const m = exports?.default ?? exports
					return (
						m?.name === name ||
						m?.displayName === name ||
						m?.type?.name === name ||
						m?.type?.displayName === name
					)
				},
				{ key: `typeName(${name})`, scopes: 4 },
			)

			const matches = rev.modules.finders.lookupModule(filter as any)
			if (
				matches &&
				matches !== rev.modules.finders.NotFoundResult &&
				matches[0]
			) {
				patchTabItem(matches[0])
			}

			const unsub = rev.modules.finders.getModules(
				filter as any,
				(m: any) => patchTabItem(m),
				{ returnNamespace: true },
			)
			cleanups.push(() => unsub?.())
		} catch {}
	}

	return () => {
		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
	}
}