import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import type { JsonStorage } from '@valenced/json-storage'
import { DEFAULT_STORAGE, type Account, type MoreAltsStorage } from './types'
import { simpleHash } from './passwordUtils'
import { syncNativeVault } from '../patches/nativeSwitcher'

type SwitchToken = (token: string) => unknown
let switchToken: SwitchToken | undefined
let reportSwitchError: ((error: Error) => void) | undefined

function bindSwitchToken(actions: unknown): SwitchToken | undefined {
	if (
		typeof actions !== 'object' ||
		actions === null ||
		!('switchAccountToken' in actions) ||
		typeof actions.switchAccountToken !== 'function'
	) {
		return
	}
	return actions.switchAccountToken.bind(actions)
}

export function installAccountActions(
	cleanup: (dispose: () => void) => void,
	report: (error: Error) => void,
) {
	reportSwitchError = report
	cleanup(() => {
		switchToken = undefined
		reportSwitchError = undefined
	})
	cleanup(
		getModuleWithImportedPath<{ default?: unknown }>(
			'actions/AuthenticationActionCreators.tsx',
			exports => {
				switchToken = bindSwitchToken(exports?.default)
			},
		),
	)
}

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

function getUserStore() {
	const rev = getValenced()
	const everest = (globalThis as any).__everest ?? rev?.everest
	if (typeof everest?.getUserStore === 'function') {
		return everest.getUserStore()
	}
	return rev?.discord?.flux?.Stores?.UserStore
}

function getMultiAccountStore() {
	return getValenced()?.discord?.flux?.Stores?.MultiAccountStore
}

function getTokenManager() {
	try {
		const finders = getValenced()?.modules?.finders
		return finders?.lookupModule?.(finders?.filters?.withProps?.('getToken'))?.[0]
	} catch {}
	return undefined
}

function getAuthActions() {
	try {
		const finders = getValenced()?.modules?.finders
		return finders?.lookupModule?.(
			finders?.filters?.withProps?.('switchAccountToken'),
		)?.[0]
	} catch {}
	return undefined
}

function getMultiAccountActions() {
	try {
		const finders = getValenced()?.modules?.finders
		return finders?.lookupModule?.(
			finders?.filters?.withProps?.('switchAccount'),
		)?.[0]
	} catch {}
	return undefined
}

export function getCurrentUser() {
	return getUserStore()?.getCurrentUser?.()
}

export function getCurrentToken(): string | undefined {
	return getTokenManager()?.getToken?.()
}

export function getAllAccounts(
	storage: JsonStorage<MoreAltsStorage>,
): Account[] {
	const current = storage.cache ?? ({} as any)
	const customAccounts = { ...(current.accounts ?? {}) }
	const customOrder = current.accountOrder ?? []

	const nativeStore = getMultiAccountStore()
	const nativeUsers: any[] = nativeStore?.getUsers?.() ?? []

	const combinedMap: Record<string, Account> = { ...customAccounts }
	const combinedOrder: string[] = [...customOrder]

	for (const u of nativeUsers) {
		if (u?.id) {
			if (!combinedMap[u.id]) {
				combinedMap[u.id] = {
					id: u.id,
					username: u.username,
					discriminator: u.discriminator || '0',
					avatar: u.avatar || null,
					displayName: u.globalName || u.username,
					token: u.pushSyncToken || u.id,
					addedAt: Date.now(),
					isNative: true,
				}
				if (!combinedOrder.includes(u.id)) {
					combinedOrder.push(u.id)
				}
			} else {
				combinedMap[u.id] = {
					...combinedMap[u.id],
					avatar: u.avatar || combinedMap[u.id].avatar,
					username: u.username || combinedMap[u.id].username,
					displayName: u.globalName || combinedMap[u.id].displayName,
					isNative: true,
				}
			}
		}
	}

	return combinedOrder
		.filter(id => combinedMap[id])
		.map(id => combinedMap[id])
}

export async function switchToAccount(
	tokenOrId: string,
	isNative?: boolean,
): Promise<boolean> {
	try {
		const rev = getValenced()
		if (typeof rev?.modules?.native?.callNativeMethod === 'function') {
			rev.modules.native.callNativeMethod('morealts.setActiveUser', [tokenOrId])
		}
	} catch {}

	if (isNative || !tokenOrId.includes('.')) {
		const multiActions = getMultiAccountActions()
		if (typeof multiActions?.switchAccount === 'function') {
			try {
				await multiActions.switchAccount(tokenOrId)
				return true
			} catch {
				// Try the token action if the native switch fails.
			}
		}
	}

	const switchAccountToken = switchToken ?? bindSwitchToken(getAuthActions())
	if (!switchAccountToken) {
		reportSwitchError?.(
			new Error('Account switching is not ready. Restart Discord and try again.'),
		)
		return false
	}

	try {
		await switchAccountToken(tokenOrId)
		return true
	} catch {
		reportSwitchError?.(new Error('Discord could not switch accounts.'))
		return false
	}
}

export async function addCurrentAccount(
	storage: JsonStorage<MoreAltsStorage>,
): Promise<{ success: boolean; message: string }> {
	const user = getCurrentUser()
	const token = getCurrentToken()

	if (!user || !token) {
		return {
			success: false,
			message: 'Could not resolve current account or token',
		}
	}

	const current = storage.cache ?? ({} as any)
	const accounts = { ...(current.accounts ?? {}) }
	const order = [...(current.accountOrder ?? [])]

	if (accounts[user.id]) {
		return {
			success: false,
			message: `Account "${user.username}" is already saved`,
		}
	}

	const newAccount: Account = {
		id: user.id,
		username: user.username,
		discriminator: user.discriminator || '0',
		avatar: user.avatar ?? null,
		displayName: user.globalName || user.username,
		token,
		addedAt: Date.now(),
	}

	accounts[user.id] = newAccount
	if (!order.includes(user.id)) order.push(user.id)

	await storage.set({ accounts, accountOrder: order })
	syncNativeVault(storage)
	return { success: true, message: `Account "${user.username}" saved!` }
}

export async function addAccountWithToken(
	storage: JsonStorage<MoreAltsStorage>,
	rawToken: string,
): Promise<{ success: boolean; message: string }> {
	let token = rawToken.trim()
	if (!token) {
		const curr = getCurrentToken()
		if (curr) token = curr
	}

	if (!token) {
		return { success: false, message: 'Please provide a valid token' }
	}

	try {
		let isBot = token.startsWith('Bot ')
		let authHeader = isBot ? token : token

		let response = await fetch('https://discord.com/api/v9/users/@me', {
			headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
		})

		if (!response.ok && !isBot) {
			const botResp = await fetch('https://discord.com/api/v9/users/@me', {
				headers: {
					Authorization: `Bot ${token}`,
					'Content-Type': 'application/json',
				},
			})
			if (botResp.ok) {
				response = botResp
				isBot = true
				authHeader = `Bot ${token}`
			}
		}

		if (!response.ok) {
			return { success: false, message: 'Invalid or expired token' }
		}

		const user = await response.json()
		const current = storage.cache ?? ({} as any)
		const accounts = { ...(current.accounts ?? {}) }
		const order = [...(current.accountOrder ?? [])]

		if (accounts[user.id]) {
			return {
				success: false,
				message: `Account "${user.username}" is already saved`,
			}
		}

		const newAccount: Account = {
			id: user.id,
			username: user.username,
			discriminator: user.discriminator || '0',
			avatar: user.avatar ?? null,
			displayName: user.global_name || user.username,
			token: authHeader,
			addedAt: Date.now(),
			isBot,
		}

		accounts[user.id] = newAccount
		if (!order.includes(user.id)) order.push(user.id)

		await storage.set({ accounts, accountOrder: order })
		syncNativeVault(storage)
		return { success: true, message: `Account "${user.username}" added!` }
	} catch (e: any) {
		return {
			success: false,
			message: `Failed to add account: ${e?.message ?? e}`,
		}
	}
}

export async function addAccountWithCredentials(
	storage: JsonStorage<MoreAltsStorage>,
	email: string,
	pass: string,
): Promise<{ success: boolean; message: string }> {
	const trimmedEmail = email.trim()
	const trimmedPass = pass.trim()

	if (!trimmedEmail || !trimmedPass) {
		return {
			success: false,
			message: 'Please enter both email and password',
		}
	}

	try {
		const response = await fetch('https://discord.com/api/v9/auth/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				login: trimmedEmail,
				password: trimmedPass,
				undelete: false,
				login_source: null,
				gift_code_sku_id: null,
			}),
		})

		const loginData = await response.json()
		if (!response.ok || !loginData.token) {
			if (loginData.captcha_key || loginData.captcha_sitekey) {
				return {
					success: false,
					message:
						'Captcha challenge required by Discord. Please use "Add Current Account" or token.',
				}
			}
			if (loginData.mfa || loginData.ticket) {
				return {
					success: false,
					message:
						'2FA/MFA is enabled on this account. Please use "Add Current Account" or token.',
				}
			}

			if (loginData.errors) {
				try {
					const fieldErrors: string[] = []
					for (const [field, val] of Object.entries(
						loginData.errors as Record<string, any>,
					)) {
						const errList = val?._errors
						if (Array.isArray(errList)) {
							for (const err of errList) {
								if (err?.message)
									fieldErrors.push(`${field}: ${err.message}`)
							}
						}
					}
					if (fieldErrors.length > 0) {
						return { success: false, message: fieldErrors.join(' | ') }
					}
				} catch {}
			}

			return {
				success: false,
				message: loginData.message || 'Login failed - check credentials',
			}
		}

		return addAccountWithToken(storage, loginData.token)
	} catch (e: any) {
		return {
			success: false,
			message: `Login request failed: ${e?.message ?? e}`,
		}
	}
}

export async function removeAccount(
	storage: JsonStorage<MoreAltsStorage>,
	accountId: string,
) {
	const current = storage.cache ?? DEFAULT_STORAGE
	const accounts = { ...(current.accounts ?? {}) }
	delete accounts[accountId]
	const order = (current.accountOrder ?? []).filter((id: unknown) => id !== accountId)
	await storage.set({ accounts, accountOrder: order })
	syncNativeVault(storage)

	const multiActions = getMultiAccountActions()
	if (typeof multiActions?.removeAccount === 'function') {
		try {
			multiActions.removeAccount(accountId)
		} catch {}
	}
}

export async function forceLogout(): Promise<void> {
	const auth = getAuthActions()
	if (auth?.switchAccountToken) {
		const fakeToken = [
			'MTExMTExMTExMTExMTExMTEx',
			'GxxxXx',
			'xXxXxXxXxXxXxXxXxXxXxXxXxXxXx',
		].join('.')
		try {
			await auth.switchAccountToken(fakeToken)
		} catch {}
	}
}

export function exportAccountsJson(
	storage: JsonStorage<MoreAltsStorage>,
): string {
	const accounts = getAllAccounts(storage)

	const exportData = {
		accounts: accounts.map(a => ({
			id: a.id,
			username: a.username,
			discriminator: a.discriminator,
			avatar: a.avatar,
			displayName: a.displayName,
			token: a.token,
			addedAt: a.addedAt,
			isBot: a.isBot,
		})),
		exportPasswordHash: storage.cache?.exportPasswordHash ?? null,
		exportedAt: Date.now(),
		version: '2.0',
	}

	return JSON.stringify(exportData, null, 2)
}

export async function importAccountsJson(
	storage: JsonStorage<MoreAltsStorage>,
	rawJson: string,
	password?: string,
): Promise<{
	success: boolean
	imported: number
	skipped: number
	message?: string
}> {
	try {
		const data = JSON.parse(rawJson.trim())
		const accountsArray = Array.isArray(data.accounts)
			? data.accounts
			: Array.isArray(data)
				? data
				: null

		if (!accountsArray) {
			return {
				success: false,
				imported: 0,
				skipped: 0,
				message: 'Invalid import JSON structure',
			}
		}

		const current = storage.cache ?? ({} as any)
		if (data.exportPasswordHash) {
			const expectedHash = data.exportPasswordHash
			if (!password || simpleHash(password) !== expectedHash) {
				return {
					success: false,
					imported: 0,
					skipped: 0,
					message: 'Incorrect import password',
				}
			}
		}

		const existing = { ...(current.accounts ?? {}) }
		const order = [...(current.accountOrder ?? [])]
		let imported = 0
		let skipped = 0

		for (const acc of accountsArray) {
			if (acc.id && acc.token && acc.username) {
				if (!existing[acc.id]) {
					existing[acc.id] = {
						id: acc.id,
						username: acc.username,
						discriminator: acc.discriminator ?? '0',
						avatar: acc.avatar ?? null,
						displayName: acc.displayName ?? acc.username,
						token: acc.token,
						addedAt: acc.addedAt ?? Date.now(),
						isBot: acc.isBot,
					}
					if (!order.includes(acc.id)) order.push(acc.id)
					imported++
				} else {
					skipped++
				}
			}
		}

		await storage.set({ accounts: existing, accountOrder: order })
		syncNativeVault(storage)
		return { success: true, imported, skipped }
	} catch (e: any) {
		return {
			success: false,
			imported: 0,
			skipped: 0,
			message: e?.message ?? 'JSON parse error',
		}
	}
}
