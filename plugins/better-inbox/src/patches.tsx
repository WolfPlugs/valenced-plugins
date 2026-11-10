import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { patchComponent } from './lib/componentPatch'
import { InboxContext } from './ui/context'
import NotificationCenter from './ui/NotificationCenter'
import { replaceNotificationButton } from './ui/notificationTree'
import { openNotificationCenter } from './ui/openInbox'
import type { ReactNode } from 'react'
import type { InboxController } from './ui/context'

type Cleanup = (callback: () => void) => void
interface NotificationManager {
	showNotification(...args: unknown[]): unknown
	playNotificationSound?(...args: unknown[]): unknown
}

export function installPatches(controller: InboxController, cleanup: Cleanup) {
	// Patch the native feed itself, not only a particular button that opens it.
	// Discord also opens this screen from routes which bypass the You bar bell.
	cleanup(
		getModuleWithImportedPath<Record<string, unknown>>(
			'modules/notification_center/native/NotificationCenterForYou.tsx',
			module => {
				try {
					const key = module.NotificationCenterForYou
						? 'NotificationCenterForYou'
						: 'default'
					cleanup(
						patchComponent(module, key, () => (
							<InboxContext.Provider value={controller}>
								<NotificationCenter />
							</InboxContext.Provider>
						)),
					)
				} catch (error) {
					controller.reportError(error)
				}
			},
		),
	)
	function NotificationButton({ tree }: { tree: ReactNode }) {
		const settings = controller.storage.use()
		if (settings?.showYouBarButton === false) return tree
		try {
			return replaceNotificationButton(tree, () =>
				openNotificationCenter(controller),
			)
		} catch (error) {
			controller.reportError(error)
			return tree
		}
	}
	cleanup(
		getModuleWithImportedPath<Record<string, unknown>>(
			'modules/main_tabs_v2/native/you_bar/YouBarNotificationsButton.tsx',
			module => {
				try {
					const key = module.YouBarNotificationsButton
						? 'YouBarNotificationsButton'
						: 'default'
					cleanup(
						patchComponent(module, key, tree => (
							<NotificationButton tree={tree} />
						)),
					)
				} catch (error) {
					controller.reportError(error)
				}
			},
		),
	)
	const patched = new WeakSet<object>()
	cleanup(
		getModules(
			withProps<NotificationManager>('showNotification'),
			manager => {
				if (patched.has(manager)) return
				patched.add(manager)
				try {
					cleanup(
						instead(manager, 'showNotification', function (args, original) {
							if (!controller.storage.cache?.blockSystemNotifications)
								return Reflect.apply(original, this, args)
						}),
					)
					if (typeof manager.playNotificationSound === 'function') {
						const target = manager as Required<NotificationManager>
						cleanup(
							instead(
								target,
								'playNotificationSound',
								function (args, original) {
									if (!controller.storage.cache?.blockSystemNotifications)
										return Reflect.apply(original, this, args)
								},
							),
						)
					}
				} catch (error) {
					controller.reportError(error)
				}
			},
			{ cached: true },
		),
	)
}
