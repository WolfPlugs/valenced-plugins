import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { BottomSheet as Gorhom } from '@valenced/externals/gorhom'
import { createElement as h, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { saveAccount } from './accounts'
import {
	authenticateBot,
	authenticateCredentials,
	authenticateUserToken,
} from './api'
import type { JsonStorage } from '@valenced/json-storage'
import type { AccountStorage, SavedAccount } from './accounts'

const sheetKey = 'wolfie.bot-client.add-account'
type Props = {
	reportError: (error: unknown) => void
	kind: 'bot' | 'user'
	storage: JsonStorage<AccountStorage>
}

function AddAccountSheet({ kind, storage, reportError }: Props) {
	const [token, setToken] = useState('')
	const [credentials, setCredentials] = useState(false)
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const running = useRef(false)
	const mounted = useRef(true)
	const request = useRef<AbortController | null>(null)
	const retryAt = useRef(0)
	useEffect(() => {
		mounted.current = true
		return () => {
			mounted.current = false
			request.current?.abort()
		}
	}, [])
	async function run(action: () => Promise<void>) {
		if (running.current) return
		running.current = true
		setBusy(true)
		setMessage('')
		try {
			await action()
		} catch (error) {
			reportError(error)
			if (mounted.current)
				setMessage('Could not complete the account action. Please try again.')
		} finally {
			running.current = false
			if (mounted.current) setBusy(false)
		}
	}
	async function addToken() {
		if (Date.now() < retryAt.current) {
			setMessage(
				`Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`,
			)
			return
		}
		const controller = new AbortController()
		request.current = controller
		try {
			const result =
				kind === 'bot'
					? await authenticateBot(token, fetch, controller.signal)
					: credentials
						? await authenticateCredentials(
								email,
								password,
								fetch,
								controller.signal,
							)
						: await authenticateUserToken(token, fetch, controller.signal)
			if (controller.signal.aborted) return
			if (result.kind === 'error') {
				retryAt.current = Date.now() + result.retryAfterMs
				setMessage(result.message)
				return
			}
			const account: SavedAccount =
				'account' in result
					? result.account
					: {
							id: result.session.user.id,
							username: result.session.user.username,
							avatar:
								typeof result.session.user.avatar === 'string'
									? result.session.user.avatar
									: null,
							bot: true,
							token: `Bot ${result.session.token}`,
						}
			await saveAccount(storage, account)
			if (mounted.current) {
				setToken('')
				setPassword('')
				closeAccountSheet()
			}
		} finally {
			request.current = null
		}
	}
	return h(
		Design.ActionSheet,
		{
			scrollable: true,
			handleDisabled: false,
			keyboardShouldPersistTaps: 'handled',
			header: h(Design.BottomSheetTitleHeader, {
				title: kind === 'bot' ? 'Add a bot' : 'Add a Discord account',
			}),
			startExpanded: true,
			onDismiss: () => {
				request.current?.abort()
				setToken('')
				setPassword('')
			},
		},
		h(
			Gorhom.BottomSheetScrollView,
			{
				style: { flex: 1 },
				contentContainerStyle: { paddingBottom: 32 },
				keyboardShouldPersistTaps: 'handled',
			},
			h(Design.TableRowGroup, {
				children: [
					kind === 'user'
						? h(Design.TableRow, {
								key: 'credentials',
								label: credentials ? 'Use account token' : 'Email and password',
								subLabel: credentials
									? 'Switch sign-in method'
									: 'Sign in without leaving this sheet',
								arrow: true,
								disabled: busy,
								onPress: () => {
									setCredentials(!credentials)
									setMessage('')
								},
							})
						: null,
				],
			}),
			h(
				View,
				{ style: { paddingVertical: 16 } },
				credentials
					? h(
							View,
							{ style: { gap: 16 } },
							h(Design.TextInput, {
								label: 'Email or phone',
								value: email,
								onChange: setEmail,
								editable: !busy,
							}),
							h(Design.TextInput, {
								label: 'Password',
								value: password,
								onChange: setPassword,
								secureTextEntry: true,
								editable: !busy,
							}),
						)
					: h(Design.TextInput, {
							label: kind === 'bot' ? 'Bot token' : 'Account token',
							placeholder:
								kind === 'bot' ? 'Paste bot token' : 'Paste account token',
							secureTextEntry: true,
							maxLength: 512,
							value: token,
							onChange: setToken,
							editable: !busy,
						}),
			),
			h(Design.TableRowGroup, {
				children: [
					message ? h(Design.TableRow, { key: 'error', label: message }) : null,
					h(Design.TableRow, {
						key: 'save',
						label: busy
							? 'Saving account...'
							: credentials
								? 'Sign in and save account'
								: 'Save account',
						disabled:
							busy ||
							(credentials ? !email.trim() || !password : !token.trim()),
						onPress: () => {
							void run(addToken)
						},
					}),
					h(Design.TableRow, {
						key: 'cancel',
						label: 'Cancel',
						onPress: closeAccountSheet,
					}),
				],
			}),
		),
	)
}

export function openAccountSheet(
	kind: Props['kind'],
	storage: Props['storage'],
	reportError: Props['reportError'],
) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: AddAccountSheet }),
		sheetKey,
		{ kind, storage, reportError },
		'stack',
	)
}
export function closeAccountSheet() {
	ActionSheetActionCreators.hideActionSheet(sheetKey)
}
