import { describe, expect, it } from 'bun:test'
import {
	allowsPresence,
	BotIntents,
	botDmBody,
	botGatewayCommand,
	botGuild,
	botReady,
	botUser,
	botVerification,
	isUserOnlyRoute,
} from '../plugins/bot-client/protocol'

describe('native bot protocol', () => {
	it('replaces user Identify fields with bot authentication and nonprivileged intents', () => {
		const command = botGatewayCommand(2, {
			token: 'Bot test-token',
			capabilities: 123,
			client_state: { guild_versions: {} },
			compress: true,
		})
		expect(command).toEqual([
			2,
			{
				token: 'test-token',
				intents: BotIntents,
				properties: {
					os: 'android',
					browser: 'BotClient',
					device: 'BotClient',
				},
				compress: true,
				large_threshold: 50,
			},
		])
		expect(BotIntents & (2 | 256 | 32768)).toBe(0)
	})
	it('resumes with a raw token and converts QOS heartbeats to sequence heartbeats', () => {
		expect(
			botGatewayCommand(6, {
				token: 'Bot test-token',
				session_id: 'session',
				seq: 42,
			}),
		).toEqual([6, { token: 'test-token', session_id: 'session', seq: 42 }])
		expect(botGatewayCommand(40, { seq: 42, qos: {} })).toEqual([1, 42])
		expect(botGatewayCommand(1, null)).toEqual([1, null])
	})
	it('drops user subscriptions, private calls, and streams', () => {
		for (const op of [8, 13, 14, 18, 20, 37])
			expect(botGatewayCommand(op, {})).toBeNull()
		expect(botGatewayCommand(2, {})).toBeNull()
	})
	it('fills missing READY fields without changing the bot identity or actual guilds', () => {
		const user = { id: '123', username: 'bot', bot: true }
		const guilds = [{ id: '456', unavailable: true }]
		const ready = botReady({ user, guilds, session_id: 'session' })
		expect(ready.user).toEqual({ ...user, nsfw_allowed: true })
		expect(ready.guilds).toBe(guilds)
		expect(ready.read_state.entries).toEqual([])
		expect(ready.sessions).toEqual([])
		expect(user).not.toHaveProperty('premium')
	})
	it('blocks user-only requests and preserves bot REST operations', () => {
		for (const url of [
			'/users/@me/relationships',
			'/users/@me/settings-proto/1',
			'/users/@me/billing/subscriptions',
			'/channels/123/messages/456/ack',
			'https://discord.com/api/v10/users/@me/connections',
		])
			expect(isUserOnlyRoute(url)).toBe(true)
		for (const url of [
			'/users/@me',
			'/users/@me/guilds?limit=200',
			'/channels/123/messages',
			'/channels/123/messages/456/reactions/x/@me',
			'/users/@me/channels',
			'/guilds/123/members/@me',
		])
			expect(isUserOnlyRoute(url)).toBe(false)
	})
})

it('adapts flat bot guilds to native full-sync guild payloads', () => {
	const channels = [{ id: '789', guild_id: '456', type: 0 }]
	const guild = botGuild({
		id: '456',
		name: 'Test',
		channels,
		roles: [{ id: '456', permissions: '1024' }],
	})
	expect(guild.properties.name).toBe('Test')
	expect(guild.channels).toBe(channels)
	expect(guild.threads).toEqual([])
	expect(guild.voice_states).toEqual([])
	expect(guild.data_mode).toBe('full')
})

it('exempts bots from user account verification while retaining verification role checks', () => {
	const check = {
		notClaimed: true,
		notEmailVerified: true,
		notPhoneVerified: true,
		newAccount: true,
		newMember: true,
		canChat: false,
		missingVerificationRole: false,
	}
	expect(botVerification(check)).toMatchObject({
		notClaimed: false,
		notEmailVerified: false,
		notPhoneVerified: false,
		newAccount: false,
		newMember: false,
		canChat: true,
	})
	expect(
		botVerification({ ...check, missingVerificationRole: true }).canChat,
	).toBe(false)
	expect(check.notClaimed).toBe(true)
})

it('requests presence only when explicitly enabled for this Identify', () => {
	const command = botGatewayCommand(2, { token: 'Bot test-token' }, true)
	expect(command).toMatchObject([2, { intents: BotIntents | 256 }])
	expect(botGatewayCommand(2, { token: 'Bot test-token' })).toMatchObject([
		2,
		{ intents: BotIntents },
	])
})

it('detects approved and limited presence capability flags safely', () => {
	expect(allowsPresence({ flags: 1 << 12 })).toBe(true)
	expect(allowsPresence({ flags: 1 << 13 })).toBe(true)
	expect(allowsPresence({ flags_new: String((1n << 40n) | (1n << 13n)) })).toBe(
		true,
	)
	expect(allowsPresence({ flags: 1 << 15 })).toBe(false)
	expect(allowsPresence({ flags: -1 })).toBe(false)
	expect(allowsPresence(null)).toBe(false)
})

it('adapts native DM creation to the bot API without changing other requests', () => {
	const body = { recipients: ['123'], flags: 0 }
	expect(botDmBody('/users/@me/channels', body)).toEqual({
		recipient_id: '123',
		flags: 0,
	})
	expect(
		botDmBody('https://discord.com/api/v10/users/@me/channels', body),
	).toEqual({ recipient_id: '123', flags: 0 })
	expect(body).toEqual({ recipients: ['123'], flags: 0 })
	expect(botDmBody('/channels/456/messages', body)).toBe(body)
	for (const input of [
		undefined,
		null,
		{ recipient_id: '123' },
		{ recipients: [] },
		{ recipients: ['123', '456'] },
		{ recipients: [null] },
	]) {
		expect(botDmBody('/users/@me/channels', input)).toBe(input)
	}
})

it('adapts missing human age eligibility only on bot identities', () => {
	const bot = { id: '123', bot: true, nsfw_allowed: false }
	expect(botUser(bot)).toEqual({ ...bot, nsfw_allowed: true })
	expect(bot.nsfw_allowed).toBe(false)
	const user = { id: '456', bot: false, nsfw_allowed: false }
	expect(botUser(user)).toBe(user)
	expect(botUser(undefined)).toBeUndefined()
})

it('requests voice-state events and supports joining, moving, muting, and leaving guild voice', () => {
	expect(BotIntents & 128).toBe(128)
	const data = {
		guild_id: '123',
		channel_id: '456',
		self_mute: false,
		self_deaf: true,
		self_video: true,
		flags: 7,
	}
	expect(botGatewayCommand(4, data)).toEqual([
		4,
		{ guild_id: '123', channel_id: '456', self_mute: false, self_deaf: true },
	])
	expect(
		botGatewayCommand(4, { ...data, channel_id: '789', self_mute: true }),
	).toEqual([
		4,
		{ guild_id: '123', channel_id: '789', self_mute: true, self_deaf: true },
	])
	expect(botGatewayCommand(4, { guild_id: '123', channel_id: null })).toEqual([
		4,
		{ guild_id: '123', channel_id: null, self_mute: false, self_deaf: false },
	])
	expect(data.self_video).toBe(true)
})

it('rejects private calls and malformed voice updates', () => {
	for (const data of [
		null,
		{},
		{ guild_id: null, channel_id: '456' },
		{ guild_id: '', channel_id: '456' },
		{ guild_id: '123' },
		{ guild_id: '123', channel_id: 456 },
		{ guild_id: '123', channel_id: 'not-an-id' },
	])
		expect(botGatewayCommand(4, data)).toBeNull()
})
