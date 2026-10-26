import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import {
	canViewChannel,
	isRecord,
	memberListPayload,
	parseMembers,
} from './protocol'
import type { BotMember as Member } from './protocol'

export function installMemberList(
	cleanup: (...callbacks: (() => void)[]) => void,
	getToken: () => string | null,
	dispatch: (data: unknown, event: string) => void,
	log: (message: string) => void,
	reportError: (error: unknown) => void,
) {
	const guilds = new Map<string, Record<string, unknown>>()
	const cache = new Map<string, { members: Member[]; expires: number }>()
	const pending = new Map<string, Promise<Member[] | null>>()
	const cooldown = new Map<string, number>()
	const published = new Map<string, Member[]>()
	const presences = new Map<string, Map<string, Record<string, unknown>>>()
	const lists = new Map<
		string,
		{ guildId: string; channelId: string; listId: string }
	>()
	const controllers = new Set<AbortController>()
	let presenceEnabled = false
	let refreshTimer: ReturnType<typeof setTimeout> | undefined
	function publish(
		guildId: string,
		channelId: string,
		listId: string,
		members: Member[],
	) {
		const guild = guilds.get(guildId)
		const channel = getChannel?.(channelId)
		if (!guild || !isRecord(channel) || stopped) return
		const visible = members.filter(member =>
			canViewChannel(member, guild, channel),
		)
		dispatch(
			memberListPayload(
				guildId,
				listId,
				visible,
				presenceEnabled ? (presences.get(guildId) ?? new Map()) : undefined,
			),
			'GUILD_MEMBER_LIST_UPDATE',
		)
	}
	function rememberPresence(data: unknown) {
		if (
			!isRecord(data) ||
			typeof data.guild_id !== 'string' ||
			!isRecord(data.user) ||
			typeof data.user.id !== 'string' ||
			!['online', 'idle', 'dnd', 'offline', 'invisible'].includes(
				String(data.status),
			)
		)
			return
		let guildPresences = presences.get(data.guild_id)
		if (!guildPresences)
			presences.set(data.guild_id, (guildPresences = new Map()))
		guildPresences.set(data.user.id, data)
		if (refreshTimer !== undefined) return
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined
			for (const context of lists.values()) {
				const cached = cache.get(context.guildId)
				if (cached)
					publish(
						context.guildId,
						context.channelId,
						context.listId,
						cached.members,
					)
			}
		}, 100)
	}
	let getChannel: ((id: string) => unknown) | undefined
	let stopped = false
	cleanup(() => {
		stopped = true
		for (const controller of controllers) controller.abort()
		controllers.clear()
		if (refreshTimer !== undefined) clearTimeout(refreshTimer)
		cache.clear()
		guilds.clear()
		published.clear()
	})
	cleanup(
		getModuleWithImportedPath<{
			default: { getChannel(id: string): unknown }
		}>('stores/ChannelStore.tsx', ({ default: store }) => {
			if (store && typeof store.getChannel === 'function')
				getChannel = id => store.getChannel(id)
		}),
	)
	async function load(guildId: string) {
		const cached = cache.get(guildId)
		if (cached && cached.expires > Date.now()) return cached.members
		const active = pending.get(guildId)
		if (active) return active
		if ((cooldown.get(guildId) ?? 0) > Date.now()) return null
		const token = getToken()
		if (!token?.startsWith('Bot ')) return null
		const request = (async () => {
			const controller = new AbortController()
			controllers.add(controller)
			const timer = setTimeout(() => controller.abort(), 15000)
			let response: Response
			let body: unknown
			try {
				response = await fetch(
					`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`,
					{
						headers: { Authorization: token },
						signal: controller.signal,
					},
				)
				body = await response.json()
			} finally {
				clearTimeout(timer)
				controllers.delete(controller)
			}
			if (stopped || token !== getToken()) return null
			if (response.status === 429) {
				const retry =
					isRecord(body) &&
					typeof body.retry_after === 'number' &&
					Number.isFinite(body.retry_after)
						? body.retry_after * 1000
						: 60000
				cooldown.set(guildId, Date.now() + Math.max(1000, retry))
				throw new Error('Member request rate limited')
			}
			if (!response.ok)
				throw new Error(
					response.status === 403
						? 'Member list requires Server Members Intent in the Discord Developer Portal.'
						: 'Member request failed',
				)
			const members = parseMembers(body).slice(0, 100)
			cache.set(guildId, { members, expires: Date.now() + 60000 })
			log(`Bot member list loaded: ${members.length} members`)
			return members
		})()
		pending.set(guildId, request)
		try {
			return await request
		} finally {
			if (pending.get(guildId) === request) pending.delete(guildId)
		}
	}
	cleanup(
		getModuleWithImportedPath<{
			default: { getProps(guildId: string | null, channelId: string): unknown }
		}>('stores/ChannelMemberStore.tsx', ({ default: store }) => {
			if (!store || typeof store.getProps !== 'function') return
			cleanup(
				instead(store, 'getProps', (args, original) => {
					const result = original(...args)
					const [guildId, channelId] = args
					if (
						!getToken()?.startsWith('Bot ') ||
						typeof guildId !== 'string' ||
						typeof channelId !== 'string' ||
						!isRecord(result) ||
						typeof result.listId !== 'string'
					)
						return result
					const listId = result.listId.slice(guildId.length + 1)
					const key = `${guildId}:${listId}`
					lists.clear()
					lists.set(key, { guildId, channelId, listId })
					const guild = guilds.get(guildId)
					const channel = getChannel?.(channelId)
					if (!guild || !isRecord(channel)) return result
					void load(guildId)
						.then(members => {
							if (!members || stopped || published.get(key) === members) return
							published.set(key, members)
							publish(guildId, channelId, listId, members)
						})
						.catch(error => {
							if (
								stopped ||
								(error instanceof Error && error.name === 'AbortError')
							)
								return
							reportError(error)
							cooldown.set(
								guildId,
								Math.max(cooldown.get(guildId) ?? 0, Date.now() + 60000),
							)
							log('Bot member list unavailable; retry after cooldown')
						})
					return result
				}),
			)
			log('Native member list REST adapter ready')
		}),
	)
	return {
		rememberGuild(data: unknown) {
			if (isRecord(data) && typeof data.id === 'string') {
				guilds.set(data.id, data)
				if (Array.isArray(data.presences))
					for (const presence of data.presences) {
						if (isRecord(presence))
							rememberPresence({ ...presence, guild_id: data.id })
					}
				log(
					`Initial bot presences received: ${presences.get(data.id)?.size ?? 0}`,
				)
			}
		},
		rememberPresence,
		setPresenceEnabled(enabled: boolean) {
			presenceEnabled = enabled
		},
		resetLists() {
			published.clear()
		},
		clear() {
			for (const controller of controllers) controller.abort()
			controllers.clear()
			pending.clear()
			cache.clear()
			published.clear()
			cooldown.clear()
			guilds.clear()
			presences.clear()
			lists.clear()
		},
	}
}
