import { shouldMute } from '../sound-controls/sounds'
import type { SoundGroups } from '../sound-controls/sounds'

export const triggerLabels = {
	directMessages: 'Direct and group messages',
	serverMessages: 'Server messages',
	directMentions: 'Direct mentions',
	incomingCalls: 'Incoming calls',
}

export type Settings = {
	backend: 'lovense' | 'intiface'
	intifaceEndpoint: string
	deviceIndex: string
	enabled: boolean
	endpoint: string
	toy: string
	strength: number
	duration: number
	triggers: Partial<
		Record<keyof typeof triggerLabels | keyof typeof SoundGroups, boolean>
	>
}

export const defaults: Settings = {
	backend: 'lovense',
	intifaceEndpoint: 'ws://127.0.0.1:12345',
	deviceIndex: '',
	enabled: false,
	endpoint: 'https://127-0-0-1.lovense.club:30010',
	toy: '',
	strength: 3,
	duration: 2,
	triggers: { directMessages: true, directMentions: true, incomingCalls: true },
}

export function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export function readSettings(value: unknown): Settings {
	const source = record(value) ? value : {}
	const triggers: Settings['triggers'] = {}
	if (record(source.triggers)) {
		for (const key of Object.keys(source.triggers)) {
			if (source.triggers[key] === true) Reflect.set(triggers, key, true)
		}
	} else Object.assign(triggers, defaults.triggers)
	return {
		backend: source.backend === 'intiface' ? 'intiface' : 'lovense',
		intifaceEndpoint:
			typeof source.intifaceEndpoint === 'string'
				? source.intifaceEndpoint
				: defaults.intifaceEndpoint,
		deviceIndex:
			typeof source.deviceIndex === 'string' ? source.deviceIndex : '',
		enabled: source.enabled === true,
		endpoint:
			typeof source.endpoint === 'string' ? source.endpoint : defaults.endpoint,
		toy: typeof source.toy === 'string' ? source.toy : '',
		strength: bounded(
			typeof source.strength === 'number' ? source.strength : defaults.strength,
			1,
			20,
		),
		duration: bounded(
			typeof source.duration === 'number' ? source.duration : defaults.duration,
			2,
			10,
		),
		triggers,
	}
}

export function commandUrl(endpoint: string): string {
	const url = new URL(endpoint.trim())
	if (
		url.protocol !== 'https:' ||
		!/^(?:\d{1,3}[-.]){3}\d{1,3}\.lovense\.club$/.test(url.hostname) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!['/', '/command'].includes(url.pathname)
	)
		throw new Error(
			'Use the HTTPS Lovense Remote LAN address, such as https://192-168-1-10.lovense.club:30010.',
		)
	url.pathname = '/command'
	return url.toString()
}

export function bounded(value: number, min: number, max: number): number {
	return Number.isFinite(value)
		? Math.max(min, Math.min(max, Math.round(value)))
		: min
}

export function functionCommand(settings: Settings, stop = false) {
	return {
		command: 'Function',
		action: stop ? 'Stop' : `Vibrate:${bounded(settings.strength, 1, 20)}`,
		timeSec: stop ? 0 : bounded(settings.duration, 2, 10),
		apiVer: 1,
		stopPrevious: 1,
		...(settings.toy.trim() ? { toy: settings.toy.trim() } : {}),
	}
}

export async function sendCommand(
	settings: Settings,
	command: object,
): Promise<unknown> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 5000)
	try {
		const response = await fetch(commandUrl(settings.endpoint), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-platform': 'Valenced ToyLink',
			},
			body: JSON.stringify(command),
			signal: controller.signal,
		})
		if (!response.ok)
			throw new Error(`Lovense Remote returned HTTP ${response.status}.`)
		const result: unknown = await response.json()
		if (!record(result) || result.code !== 200)
			throw new Error(
				'Lovense Remote rejected the command. Check the connection and toy ID.',
			)
		return result
	} finally {
		clearTimeout(timer)
	}
}

export function messageTriggers(
	payload: unknown,
	userId: string,
	settings: Settings,
): boolean {
	if (
		!record(payload) ||
		payload.optimistic === true ||
		!record(payload.message)
	)
		return false
	const message = payload.message
	if (
		typeof message.id !== 'string' ||
		!record(message.author) ||
		message.author.id === userId
	)
		return false
	if (
		settings.triggers.directMentions &&
		Array.isArray(message.mentions) &&
		message.mentions.some(user => record(user) && user.id === userId)
	)
		return true
	return message.guild_id || payload.guildId
		? settings.triggers.serverMessages === true
		: settings.triggers.directMessages === true
}

export function soundTriggers(name: unknown, settings: Settings): boolean {
	return shouldMute(name, { muted: settings.triggers })
}
