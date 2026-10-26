import { onFluxEventDispatched } from '@valenced/discord/flux'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { before, instead } from '@valenced/patcher'
import { installMemberList } from './members'
import {
	allowsPresence,
	botDmBody,
	botGatewayCommand,
	botGuild,
	botReady,
	botUser,
	botVerification,
	isRecord,
	isUserOnlyRoute,
} from './protocol'
import type { SavedAccount } from './accounts'

function hasTotpStore(value: unknown): value is { hasTOTPEnabled(): boolean } {
	return isRecord(value) && typeof value.hasTOTPEnabled === 'function'
}

type Cleanup = (...callbacks: (() => void)[]) => void
interface Socket {
	handleIdentify(): unknown
	send(op: number, data: unknown, ...rest: unknown[]): unknown
	_handleDispatch(data: unknown, event: string, seq: number): unknown
}
let switchToken: ((token: string) => Promise<void>) | undefined
let currentUser: (() => unknown) | undefined
let currentToken: (() => string | null) | undefined
let socketPatched = false
const listeners = new Set<(connected: boolean) => void>()
export let connected = false

export function onConnectionChange(listener: (connected: boolean) => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function hasBotToken() {
	return /^Bot\s/i.test(currentToken?.() ?? '')
}

export function getCurrentAccount(): SavedAccount {
	const user = currentUser?.()
	const token = currentToken?.()
	if (
		!token ||
		!isRecord(user) ||
		typeof user.id !== 'string' ||
		typeof user.username !== 'string'
	) {
		throw new Error('No signed-in account is available yet.')
	}
	return {
		id: user.id,
		username: user.username,
		avatar: typeof user.avatar === 'string' ? user.avatar : null,
		bot: hasBotToken() || user.bot === true,
		token,
	}
}

export async function switchNativeAccount(token: string) {
	if (!switchToken || (/^Bot\s/i.test(token) && !socketPatched)) {
		throw new Error(
			'Account switching is not ready. Restart Discord and try again.',
		)
	}
	await switchToken(token)
}

export function installBotSession(
	cleanup: Cleanup,
	log: (message: string) => void,
	reportError: (error: unknown) => void,
) {
	cleanup(() => {
		switchToken = undefined
		currentUser = undefined
		currentToken = undefined
		socketPatched = false
		connected = false
		for (const listener of listeners) listener(false)
	})
	cleanup(
		getModuleWithImportedPath<unknown>(
			'actions/AuthenticationActionCreators.tsx',
			exports => {
				if (
					!isRecord(exports) ||
					!isRecord(exports.default) ||
					typeof exports.default.switchAccountToken !== 'function'
				)
					return
				const actions = exports.default
				const switchAccountToken = actions.switchAccountToken
				if (typeof switchAccountToken !== 'function') return
				switchToken = token =>
					Promise.resolve(switchAccountToken.call(actions, token))
				log('Native token-login action ready')
			},
		),
	)
	cleanup(
		getModuleWithImportedPath<unknown>('stores/UserStore.tsx', exports => {
			if (
				!isRecord(exports) ||
				!isRecord(exports.default) ||
				typeof exports.default.getCurrentUser !== 'function'
			)
				return
			const store = exports.default
			const getCurrentUser = store.getCurrentUser
			if (typeof getCurrentUser === 'function')
				currentUser = () => getCurrentUser.call(store)
		}),
	)
	cleanup(
		getModuleWithImportedPath<unknown>(
			'stores/AuthenticationStore.tsx',
			exports => {
				if (
					!isRecord(exports) ||
					!isRecord(exports.default) ||
					typeof exports.default.getToken !== 'function'
				)
					return
				const store = exports.default
				const getToken = exports.default.getToken
				if (hasTotpStore(store))
					cleanup(
						instead(store, 'hasTOTPEnabled', (args, original) =>
							hasBotToken() ? false : original(...args),
						),
					)
				currentToken = () => {
					const token = getToken.call(store)
					return typeof token === 'string' ? token : null
				}
			},
		),
	)
	cleanup(
		getModuleWithImportedPath<{
			default: { getCheck(guildId: string): unknown }
		}>('stores/GuildVerificationStore.tsx', ({ default: store }) => {
			if (!store || typeof store.getCheck !== 'function') return
			cleanup(
				instead(store, 'getCheck', (args, original) => {
					const check = original(...args)
					return hasBotToken() && isRecord(check)
						? botVerification(check)
						: check
				}),
			)
			log('Bot user-verification composer gate patched')
		}),
	)
	let receiveDispatch: ((data: unknown, event: string) => void) | undefined
	const members = installMemberList(
		cleanup,
		() => currentToken?.() ?? null,
		(data, event) => receiveDispatch?.(data, event),
		log,
		reportError,
	)
	let voiceSession: { token: string; guildId: string } | undefined
	let presenceToken: string | undefined
	let presenceCapability: Promise<boolean> | undefined
	function checkPresence(token: string) {
		if (presenceToken === token && presenceCapability) return presenceCapability
		presenceToken = token
		presenceCapability = (async () => {
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), 5000)
			try {
				const response = await fetch(
					'https://discord.com/api/v10/applications/@me',
					{
						headers: { Authorization: token },
						signal: controller.signal,
					},
				)
				if (!response.ok) return false
				return allowsPresence(await response.json())
			} catch {
				return false
			} finally {
				clearTimeout(timer)
			}
		})()
		return presenceCapability
	}
	cleanup(
		getModuleWithImportedPath<{ socket: Socket }>(
			'modules/gateway/GatewaySocketSingleton.tsx',
			({ socket }) => {
				if (
					!socket ||
					typeof socket.send !== 'function' ||
					typeof socket._handleDispatch !== 'function'
				)
					return
				cleanup(
					instead(socket, 'send', ([op, data, ...rest], original) => {
						if (!hasBotToken()) return original(op, data, ...rest)
						if (op === 2)
							return checkPresence(currentToken?.() ?? '').then(enabled => {
								if (
									!hasBotToken() ||
									!isRecord(data) ||
									data.token !== currentToken?.()
								)
									return
								members.setPresenceEnabled(enabled)
								log(`Bot presence intent enabled: ${enabled}`)
								const command = botGatewayCommand(op, data, enabled)
								if (command) return original(command[0], command[1], ...rest)
							})
						const token = currentToken?.() ?? ''
						const voiceData =
							op === 4 &&
							isRecord(data) &&
							data.channel_id === null &&
							data.guild_id == null &&
							voiceSession?.token === token
								? { ...data, guild_id: voiceSession.guildId }
								: data
						const command = botGatewayCommand(op, voiceData)
						if (command) {
							if (
								op === 4 &&
								isRecord(command[1]) &&
								command[1].channel_id !== null &&
								typeof command[1].guild_id === 'string'
							) {
								voiceSession = { token, guildId: command[1].guild_id }
							}
							return original(command[0], command[1], ...rest)
						}
					}),
				)
				cleanup(
					before(socket, '_handleDispatch', ([data, event, seq]) => {
						if (hasBotToken() && event === 'READY' && isRecord(data)) {
							voiceSession = undefined
							log('Bot Gateway READY received')
							return [botReady(data), event, seq]
						}
						if (hasBotToken() && event === 'GUILD_CREATE' && isRecord(data)) {
							members.rememberGuild(data)
							log('Bot guild payload adapted')
							return [botGuild(data), event, seq]
						}
						if (
							hasBotToken() &&
							event === 'VOICE_STATE_UPDATE' &&
							isRecord(data)
						) {
							const user = currentUser?.()
							if (isRecord(user) && data.user_id === user.id) {
								if (
									typeof data.guild_id === 'string' &&
									typeof data.channel_id === 'string'
								) {
									voiceSession = {
										token: currentToken?.() ?? '',
										guildId: data.guild_id,
									}
								} else if (
									data.channel_id === null &&
									data.guild_id === voiceSession?.guildId
								) {
									voiceSession = undefined
								}
							}
						}
						if (hasBotToken() && event === 'USER_UPDATE')
							return [botUser(data), event, seq]
						if (hasBotToken() && event === 'PRESENCE_UPDATE')
							members.rememberPresence(data)
						return [data, event, seq]
					}),
				)
				receiveDispatch = (data, event) => {
					socket._handleDispatch(data, event, 0)
				}
				socketPatched = true
				log('Native bot Gateway adapter ready')
			},
		),
	)
	cleanup(
		getModuleWithImportedPath<{
			default(
				event: string,
			): { dispatch(...args: unknown[]): unknown } | undefined
		}>('modules/gateway/dispatchSocketMessage.tsx', exports => {
			const handler = exports.default('READY')
			if (!handler || typeof handler.dispatch !== 'function') return
			cleanup(
				instead(handler, 'dispatch', (args, original) => {
					const data = args[0]
					if (
						!hasBotToken() ||
						!isRecord(data) ||
						!isRecord(data.user) ||
						data.user.bot !== true
					)
						return original(...args)
					// Bypass only the synchronous bot logout guard. Stores retain the real bot identity.
					const user = data.user
					user.bot = false
					try {
						return original(...args)
					} finally {
						user.bot = true
					}
				}),
			)
			log('Native READY bot guard patched')
		}),
	)
	cleanup(
		getModuleWithImportedPath<{
			HTTP: Record<
				'get' | 'post' | 'put' | 'patch' | 'del',
				(
					options: { url: string; body?: unknown },
					...rest: unknown[]
				) => Promise<unknown>
			>
		}>('../discord_common/js/packages/http-utils/HTTPUtils.tsx', ({ HTTP }) => {
			if (!HTTP) return
			for (const method of ['get', 'post', 'put', 'patch', 'del'] as const) {
				if (typeof HTTP[method] !== 'function') continue
				cleanup(
					instead(HTTP, method, ([options, ...rest], original) => {
						if (hasBotToken() && isUserOnlyRoute(options.url)) {
							return Promise.reject(
								Object.assign(
									new Error('This feature is unavailable for bot accounts.'),
									{
										status: 403,
										body: {
											message: 'This feature is unavailable for bot accounts.',
											code: 50001,
										},
									},
								),
							)
						}
						if (hasBotToken() && method === 'post') {
							return original(
								{ ...options, body: botDmBody(options.url, options.body) },
								...rest,
							)
						}
						return original(options, ...rest)
					}),
				)
			}
			log('User-only HTTP routes blocked for bot sessions')
		}),
	)
	cleanup(
		onFluxEventDispatched<{ user?: unknown; auth?: unknown }>(
			'CONNECTION_OPEN',
			payload => {
				members.resetLists()
				if (hasBotToken()) payload.user = botUser(payload.user)
				if (hasBotToken()) payload.auth = { authenticator_types: [] }
				connected = true
				for (const listener of listeners) listener(true)
				log('Discord native connection opened')
				return payload
			},
		),
		onFluxEventDispatched('LOGOUT', payload => {
			voiceSession = undefined
			members.clear()
			connected = false
			for (const listener of listeners) listener(false)
			return payload
		}),
	)
}
