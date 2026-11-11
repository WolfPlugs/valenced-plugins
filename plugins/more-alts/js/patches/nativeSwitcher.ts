import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage } from '../lib/types'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

function callNative(method: string, args: any[] = []): Promise<any> {
	try {
		const rev = getValenced()
		if (typeof rev?.modules?.native?.callNativeMethod === 'function') {
			return rev.modules.native.callNativeMethod(method, args)
		}
	} catch {}
	return Promise.resolve(null)
}

export function syncNativeVault(storage: JsonStorage<MoreAltsStorage>) {
	try {
		const current = storage.cache ?? ({} as any)
		const accounts = current.accounts ?? {}
		const json = JSON.stringify(Object.values(accounts))
		void callNative('morealts.saveAccounts', [json])
	} catch {}
}

export async function restoreFromNativeVault(storage: JsonStorage<MoreAltsStorage>) {
	try {
		const raw = await callNative('morealts.loadAccounts', [])
		if (typeof raw === 'string' && raw.trim().startsWith('[')) {
			const list = JSON.parse(raw)
			if (Array.isArray(list) && list.length > 0) {
				const current = storage.cache ?? ({} as any)
				const existing = { ...(current.accounts ?? {}) }
				const order = [...(current.accountOrder ?? [])]
				let changed = false

				for (const acc of list) {
					if (acc?.id && acc?.token && !existing[acc.id]) {
						existing[acc.id] = acc
						if (!order.includes(acc.id)) order.push(acc.id)
						changed = true
					}
				}

				if (changed) {
					await storage.set({ accounts: existing, accountOrder: order })
				}
			}
		}
	} catch {}
}

export default function patchNativeSwitcher(
	storage: JsonStorage<MoreAltsStorage>,
): () => void {
	const cleanups: Array<() => void> = []
	const rev = getValenced()

	try {
		const hookedTargets = new Set<any>()

		const hookStore = (store: any) => {
			if (!store || hookedTargets.has(store)) return
			hookedTargets.add(store)

			const proto = Object.getPrototypeOf(store)
			if (proto && !hookedTargets.has(proto)) {
				hookedTargets.add(proto)
				if (typeof proto.getCanUseMultiAccountMobile === 'function') {
					try {
						cleanups.push(
							rev.patcher.after(
								proto,
								'getCanUseMultiAccountMobile',
								() => {
									if (storage.cache?.enableNativeSwitcher !== false) {
										return true
									}
								},
							),
						)
					} catch {}
				}
				if (typeof proto.getHasLoggedInAccounts === 'function') {
					try {
						cleanups.push(
							rev.patcher.after(
								proto,
								'getHasLoggedInAccounts',
								(ret: any) => {
									if (storage.cache?.enableNativeSwitcher !== false) {
										return true
									}
									return ret
								},
							),
						)
					} catch {}
				}
			}

			if (typeof store.getCanUseMultiAccountMobile === 'function') {
				try {
					cleanups.push(
						rev.patcher.after(
							store,
							'getCanUseMultiAccountMobile',
							() => {
								if (storage.cache?.enableNativeSwitcher !== false) {
									return true
								}
							},
						),
					)
				} catch {}
			}

			if (typeof store.getHasLoggedInAccounts === 'function') {
				try {
					cleanups.push(
						rev.patcher.after(
							store,
							'getHasLoggedInAccounts',
							(ret: any) => {
								if (storage.cache?.enableNativeSwitcher !== false) {
									return true
								}
								return ret
							},
						),
					)
				} catch {}
			}

			try {
				Object.defineProperty(store, 'canUseMultiAccountNotifications', {
					get: () => {
						if (storage.cache?.blockOtherAccountNotifications !== false) {
							return false
						}
						return storage.cache?.enableNativeSwitcher !== false
					},
					configurable: true,
				})
				cleanups.push(() => {
					try {
						delete (store as any).canUseMultiAccountNotifications
					} catch {}
				})
			} catch {}

			try {
				store.emitChange?.()
			} catch {}
		}

		const finders = rev.modules?.finders
		const filter = finders?.filters?.withProps?.('getCanUseMultiAccountMobile')

		if (filter && finders?.lookupModule) {
			const matches = finders.lookupModule(filter)
			for (const m of matches || []) hookStore(m)
		}

		if (filter && finders?.getModules) {
			const unsub = finders.getModules(filter, (m: any) => hookStore(m), {
				returnNamespace: true,
			})
			cleanups.push(() => unsub?.())
		}

		const Stores = rev.discord?.flux?.Stores
		const MultiAccountStore = Stores?.MultiAccountStore
		const UserStore = Stores?.UserStore

		if (MultiAccountStore) {
			hookStore(MultiAccountStore)
		}

		const syncActiveUserToNative = () => {
			const currentUserId = UserStore?.getCurrentUser?.()?.id
			if (currentUserId) {
				void callNative('morealts.setActiveUser', [currentUserId])
			}
			const shouldBlock = storage.cache?.blockOtherAccountNotifications !== false
			void callNative('morealts.setBlockNotifications', [shouldBlock])
			try {
				MultiAccountStore?.emitChange?.()
			} catch {}
		}

		syncActiveUserToNative()
		cleanups.push(storage.subscribe(syncActiveUserToNative))

		const Dispatcher =
			rev.discord?.flux?.Dispatcher ?? rev.discord?.common?.flux?.Dispatcher
		if (Dispatcher?.subscribe) {
			const handleNotification = (event: any) => {
				if (storage.cache?.blockOtherAccountNotifications === false) return
				const currentUserId = UserStore?.getCurrentUser?.()?.id
				if (!currentUserId) return

				const notifUserId =
					event?.userId ??
					event?.user_id ??
					event?.recipientId ??
					event?.recipient_id ??
					event?.message?.author?.id

				if (notifUserId && notifUserId !== currentUserId) {
					event.stopped = true
					if (typeof event.stopPropagation === 'function') {
						event.stopPropagation()
					}
				}
			}

			Dispatcher.subscribe('NOTIFICATION_CREATE', handleNotification)
			cleanups.push(() => {
				Dispatcher.unsubscribe('NOTIFICATION_CREATE', handleNotification)
			})
		}

		void restoreFromNativeVault(storage)
	} catch (e) {
		console.error('[MoreAlts] patchNativeSwitcher error:', e)
	}

	return () => {
		for (const fn of cleanups) {
			try {
				fn()
			} catch {}
		}
	}
}