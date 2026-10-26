export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Nonprivileged intents: guilds, voice states, messages, reactions, and DMs.
export const BotIntents = 1 | 128 | 512 | 1024 | 4096 | 8192

export function botGatewayCommand(
	op: number,
	data: unknown,
	presenceEnabled = false,
): [number, unknown] | null {
	if (op === 2) {
		if (!isRecord(data) || typeof data.token !== 'string') return null
		return [
			2,
			{
				token: data.token.replace(/^Bot\s+/i, ''),
				intents: BotIntents | (presenceEnabled ? 256 : 0),
				properties: {
					os: 'android',
					browser: 'BotClient',
					device: 'BotClient',
				},
				compress: data.compress === true,
				large_threshold: 50,
			},
		]
	}
	if (op === 6) {
		if (!isRecord(data) || typeof data.token !== 'string') return null
		return [
			6,
			{
				token: data.token.replace(/^Bot\s+/i, ''),
				session_id: data.session_id,
				seq: data.seq,
			},
		]
	}
	if (op === 4) {
		if (
			!isRecord(data) ||
			typeof data.guild_id !== 'string' ||
			!/^\d+$/.test(data.guild_id) ||
			(data.channel_id !== null &&
				(typeof data.channel_id !== 'string' || !/^\d+$/.test(data.channel_id)))
		)
			return null
		return [
			4,
			{
				guild_id: data.guild_id,
				channel_id: data.channel_id,
				self_mute: data.self_mute === true,
				self_deaf: data.self_deaf === true,
			},
		]
	}
	if (op === 40) return [1, isRecord(data) ? data.seq : null]
	// Member requests, streams, private calls, and user subscriptions stay disabled.
	return op === 1 || op === 3 ? [op, data] : null
}

export function botUser(user: unknown) {
	return isRecord(user) && user.bot === true
		? { ...user, nsfw_allowed: true }
		: user
}

export function botDmBody(url: string, body: unknown) {
	const path = url
		.replace(/^https:\/\/(?:canary\.|ptb\.)?discord\.com\/api(?:\/v\d+)?/, '')
		.split('?')[0]
	if (
		path !== '/users/@me/channels' ||
		!isRecord(body) ||
		!Array.isArray(body.recipients)
	)
		return body
	const [recipient] = body.recipients
	if (
		body.recipients.length !== 1 ||
		typeof recipient !== 'string' ||
		!/^\d+$/.test(recipient)
	)
		return body
	const { recipients: _recipients, ...rest } = body
	return { ...rest, recipient_id: recipient }
}

export function botReady(data: Record<string, unknown>) {
	return {
		sessions: [],
		relationships: [],
		game_relationships: [],
		connected_accounts: [],
		guild_join_requests: [],
		linked_users: [],
		users: [],
		private_channels: [],
		experiments: [],
		guild_experiments: [],
		geo_restricted_guilds: [],
		failed_states: [],
		read_state: { version: 0, partial: false, entries: [] },
		user_guild_settings: { version: 0, partial: false, entries: [] },
		notification_settings: { flags: 0 },
		auth: { authenticator_types: [] },
		consents: { personalization: { consented: false } },
		regional_feature_config: {
			age_gated_features: 0,
			teen_by_default_settings: 0,
		},
		tutorial: null,
		analytics_token: null,
		pending_payments: null,
		friend_suggestion_count: 0,
		explicit_content_scan_version: 0,
		api_code_version: 1,
		...data,
		user: botUser(data.user),
	}
}

export function isUserOnlyRoute(url: string) {
	const path = url
		.replace(/^https:\/\/(?:canary\.|ptb\.)?discord\.com\/api(?:\/v\d+)?/, '')
		.split('?')[0]
	return (
		/^\/users\/@me\/(?:relationships|settings(?:-proto)?|guilds\/[^/]+\/settings|billing|connections|devices|affinities|library|notes|activities|consents|sessions)(?:\/|$)/.test(
			path,
		) ||
		/^\/(?:science|track|hypesquad|scheduled-events|store|entitlements\/gift-codes)(?:\/|$)/.test(
			path,
		) ||
		/\/(?:ack|acks|call|recipients)(?:\/|$)/.test(path) ||
		/^\/guilds\/[^/]+\/members\/@me\/profile$/.test(path)
	)
}

export function botGuild(data: Record<string, unknown>) {
	return {
		data_mode: 'full',
		channels: [],
		threads: [],
		roles: [],
		members: [],
		presences: [],
		voice_states: [],
		emojis: [],
		stickers: [],
		stage_instances: [],
		guild_scheduled_events: [],
		activity_instances: [],
		experiments: [],
		last_messages: [],
		version: 0,
		has_threads_subscription: false,
		...data,
		properties: isRecord(data.properties) ? data.properties : { ...data },
	}
}

export function botVerification(check: Record<string, unknown>) {
	return {
		...check,
		notClaimed: false,
		notEmailVerified: false,
		notPhoneVerified: false,
		newAccount: false,
		newMember: false,
		canChat: !check.missingVerificationRole,
	}
}

export function parseMembers(value: unknown) {
	if (!Array.isArray(value)) throw new Error('Invalid member response')
	return value.map(member => {
		if (
			!isRecord(member) ||
			!isRecord(member.user) ||
			typeof member.user.id !== 'string' ||
			!Array.isArray(member.roles) ||
			!member.roles.every(role => typeof role === 'string')
		)
			throw new Error('Invalid guild member')
		return {
			...member,
			user: { ...member.user, id: member.user.id },
			roles: member.roles.filter(
				(role): role is string => typeof role === 'string',
			),
		}
	})
}
export type BotMember = ReturnType<typeof parseMembers>[number]
function bits(value: unknown) {
	return typeof value === 'bigint'
		? value
		: typeof value === 'string' && /^\d+$/.test(value)
			? BigInt(value)
			: 0n
}

export function canViewChannel(
	member: BotMember,
	guild: Record<string, unknown>,
	channel: Record<string, unknown>,
) {
	if (guild.owner_id === member.user.id) return true
	const roles = Array.isArray(guild.roles) ? guild.roles.filter(isRecord) : []
	let permissions = roles
		.filter(
			role =>
				role.id === guild.id ||
				(typeof role.id === 'string' && member.roles.includes(role.id)),
		)
		.reduce((permissions, role) => permissions | bits(role.permissions), 0n)
	if (permissions & 8n) return true
	const overwrites = isRecord(channel.permissionOverwrites)
		? Object.values(channel.permissionOverwrites).filter(isRecord)
		: []
	const apply = (items: Record<string, unknown>[]) => {
		const denied = items.reduce((all, item) => all | bits(item.deny), 0n)
		const allowed = items.reduce((all, item) => all | bits(item.allow), 0n)
		permissions = (permissions & ~denied) | allowed
	}
	apply(overwrites.filter(item => item.id === guild.id))
	apply(
		overwrites.filter(
			item => typeof item.id === 'string' && member.roles.includes(item.id),
		),
	)
	apply(overwrites.filter(item => item.id === member.user.id))
	return (permissions & 1024n) !== 0n
}

export function allowsPresence(application: unknown) {
	if (!isRecord(application)) return false
	const flags = bits(
		application.flags_new ??
			(typeof application.flags === 'number' &&
			Number.isSafeInteger(application.flags) &&
			application.flags >= 0
				? String(application.flags)
				: application.flags),
	)
	return (flags & ((1n << 12n) | (1n << 13n))) !== 0n
}

export function memberListPayload(
	guildId: string,
	listId: string,
	members: BotMember[],
	presences?: ReadonlyMap<string, Record<string, unknown>>,
) {
	const groups: { id: string; count: number }[] = []
	const items: (
		| { group: { id: string; count: number } }
		| { member: BotMember & { presence?: Record<string, unknown> } }
	)[] = []
	const online = presences
		? members.filter(member =>
				['online', 'idle', 'dnd'].includes(
					String(presences.get(member.user.id)?.status),
				),
			)
		: []
	const onlineIds = new Set(online.map(member => member.user.id))
	const offline = members.filter(member => !onlineIds.has(member.user.id))
	for (const [id, list] of presences
		? ([
				['online', online],
				['offline', offline],
			] as const)
		: ([['unknown', members]] as const)) {
		if (!list.length) continue
		const group = { id, count: list.length }
		groups.push(group)
		items.push({ group })
		for (const member of list)
			items.push({
				member: presences
					? {
							...member,
							presence: {
								user: member.user,
								status: 'offline',
								activities: [],
								client_status: {},
								...presences.get(member.user.id),
							},
						}
					: member,
			})
	}
	return {
		guild_id: guildId,
		id: listId,
		member_count: members.length,
		online_count: online.length,
		groups,
		ops: items.length
			? [{ op: 'SYNC', range: [0, items.length - 1], items }]
			: [{ op: 'SYNC', range: [0, 0], items: [] }],
	}
}
