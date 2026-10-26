import Page from '@valenced/components/Page'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createElement as h, useEffect, useRef, useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { accountAvatarUrl, isBotAccount, saveAccount } from './accounts'
import {
	getCurrentAccount,
	onConnectionChange,
	switchNativeAccount,
} from './session'
import { openAccountSheet } from './sheet'
import type { JsonStorage } from '@valenced/json-storage'
import type { ReactNode } from 'react'
import type { AccountStorage, SavedAccount } from './accounts'

function group(title: string, ...children: ReactNode[]) {
	return h(Design.TableRowGroup, { title, children })
}

export default function AccountScreen({
	storage,
	reportError,
}: {
	storage: JsonStorage<AccountStorage>
	reportError: (error: unknown) => void
}) {
	const data = storage.use()
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const [, render] = useState(0)
	const running = useRef(false)
	useEffect(() => {
		const unsubscribe = onConnectionChange(() => render(value => value + 1))
		return () => {
			unsubscribe()
		}
	}, [])
	let current: SavedAccount | undefined
	try {
		current = getCurrentAccount()
	} catch {}

	async function run(action: () => Promise<void>) {
		if (running.current) return
		running.current = true
		setBusy(true)
		setMessage('')
		try {
			await action()
		} catch (error) {
			reportError(error)
			setMessage(
				'Could not complete the account action. Check your connection and try again.',
			)
		} finally {
			running.current = false
			setBusy(false)
		}
	}
	async function saveCurrent() {
		await saveAccount(storage, getCurrentAccount())
		setMessage('Current account saved.')
	}
	async function switchTo(account: SavedAccount) {
		await saveAccount(storage, getCurrentAccount())
		await switchNativeAccount(account.token)
	}
	function remove(account: SavedAccount) {
		AlertActionCreators.openAlert(
			'wolfie.bot-client.remove-account',
			h(Design.AlertModal, {
				title: 'Remove saved account?',
				content: `Remove ${account.username} from Bot Client? This does not log it out of Discord.`,
				actions: [
					h(Design.AlertActionButton, {
						key: 'cancel',
						text: 'Cancel',
						variant: 'secondary',
						onPress: closeAccountAlerts,
					}),
					h(Design.AlertActionButton, {
						key: 'remove',
						text: 'Remove',
						variant: 'destructive',
						onPress: () => {
							closeAccountAlerts()
							void run(async () => {
								const latest = await storage.get()
								await storage.set({
									accounts: latest.accounts.filter(
										saved => saved.id !== account.id,
									),
								})
							})
						},
					}),
				],
			}),
		)
	}

	function openAdd(kind: 'bot' | 'user') {
		openAccountSheet(kind, storage, reportError)
	}
	const rows = (data?.accounts ?? []).map(account =>
		h(Design.TableRow, {
			key: account.id,
			label: h(
				View,
				{ style: { flexDirection: 'row', alignItems: 'center', gap: 6 } },
				h(
					Design.Text,
					{
						numberOfLines: 1,
						style: { color: '#f2f3f5', fontSize: 16, flexShrink: 1 },
					},
					account.username,
				),
				isBotAccount(account)
					? h(
							View,
							{
								style: {
									backgroundColor: '#5865f2',
									borderRadius: 4,
									paddingHorizontal: 5,
									paddingVertical: 2,
								},
							},
							h(
								Design.Text,
								{
									accessibilityLabel: 'Bot account',
									style: { color: '#fff', fontSize: 10, fontWeight: '700' },
								},
								'APP',
							),
						)
					: null,
			),
			icon: h(Image, {
				source: { uri: accountAvatarUrl(account) },
				accessibilityLabel: `${account.username} avatar`,
				style: { width: 40, height: 40, borderRadius: 20 },
			}),
			subLabel: current?.id === account.id ? 'Current account' : undefined,
			disabled: busy,
			onPress: () => {
				if (current?.id !== account.id) void run(() => switchTo(account))
			},
			trailing: h(Design.Button, {
				text: 'Remove',
				size: 'sm',
				variant: 'tertiary',
				accessibilityLabel: `Remove ${account.username}`,
				disabled: busy,
				onPress: event => {
					event.stopPropagation()
					remove(account)
				},
			}),
		}),
	)
	return h(
		ScrollView,
		{
			style: { flex: 1 },
			contentContainerStyle: { paddingBottom: 32 },
			keyboardShouldPersistTaps: 'handled',
		},
		h(
			Page,
			null,
			group(
				'Add account',
				h(Design.TableRow, {
					label: 'Add a Discord account',
					subLabel: 'Email, password, or account token',
					arrow: true,
					disabled: busy,
					onPress: () => openAdd('user'),
				}),
				h(Design.TableRow, {
					label: 'Add a bot',
					subLabel: 'Use a bot token',
					arrow: true,
					disabled: busy,
					onPress: () => openAdd('bot'),
				}),
			),
			group(
				'Accounts',
				...rows,
				h(Design.TableRow, {
					label: 'Save current account',
					subLabel: current?.username ?? 'Log in to Discord normally first',
					disabled: busy || !current,
					onPress: () => {
						void run(saveCurrent)
					},
				}),
			),
			message ? h(Design.TableRow, { label: message }) : null,
		),
	)
}

export function closeAccountAlerts() {
	AlertActionCreators.dismissAlert('wolfie.bot-client.remove-account')
}
