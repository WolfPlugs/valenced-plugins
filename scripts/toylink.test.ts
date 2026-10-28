import { afterEach, expect, test } from 'bun:test'
import {
	commandUrl,
	defaults,
	functionCommand,
	messageTriggers,
	readSettings,
	sendCommand,
	soundTriggers,
} from '../plugins/toylink/control'

const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

test('LAN address validation and bounded finite commands', () => {
	expect(commandUrl(defaults.endpoint)).toBe(`${defaults.endpoint}/command`)
	for (const endpoint of [
		'http://127-0-0-1.lovense.club:30010',
		'https://example.com',
		'https://127-0-0-1.lovense.club.evil.com',
		`${defaults.endpoint}/other`,
	]) {
		expect(() => commandUrl(endpoint)).toThrow()
	}
	expect(
		functionCommand({ ...defaults, strength: 99, duration: 0, toy: ' abc ' }),
	).toEqual({
		command: 'Function',
		action: 'Vibrate:20',
		timeSec: 2,
		apiVer: 1,
		stopPrevious: 1,
		toy: 'abc',
	})
	expect(functionCommand(defaults, true).action).toBe('Stop')
	expect(
		readSettings({ strength: Number.NaN, duration: Infinity }).duration,
	).toBe(2)
})

test('message options filter self, optimistic messages, server messages and mentions', () => {
	const message = { id: '1', author: { id: 'other' }, mentions: [] }
	expect(messageTriggers({ message }, 'me', defaults)).toBe(true)
	expect(
		messageTriggers(
			{ message: { ...message, guild_id: 'server' } },
			'me',
			defaults,
		),
	).toBe(false)
	expect(messageTriggers({ guildId: 'server', message }, 'me', defaults)).toBe(
		false,
	)
	expect(
		messageTriggers(
			{ message: { ...message, guild_id: 'server', mentions: [{ id: 'me' }] } },
			'me',
			defaults,
		),
	).toBe(true)
	expect(
		messageTriggers(
			{ message: { ...message, author: { id: 'me' } } },
			'me',
			defaults,
		),
	).toBe(false)
	expect(messageTriggers({ message, optimistic: true }, 'me', defaults)).toBe(
		false,
	)
	expect(
		messageTriggers({ message }, 'me', { ...defaults, triggers: {} }),
	).toBe(false)
	expect(
		soundTriggers('call_ringing', {
			...defaults,
			triggers: { ringtone: true },
		}),
	).toBe(true)
	expect(soundTriggers('message1', defaults)).toBe(false)
})

test('official request fields and API failures', async () => {
	let request: RequestInit | undefined
	globalThis.fetch = Object.assign(
		async (_input: unknown, init?: RequestInit) => {
			request = init
			return Response.json({ code: 200 })
		},
		{ preconnect: originalFetch.preconnect },
	)
	await sendCommand(defaults, functionCommand(defaults))
	expect(request?.method).toBe('POST')
	expect(request?.headers).toEqual({
		'Content-Type': 'application/json',
		'X-platform': 'Valenced ToyLink',
	})
	expect(JSON.parse(String(request?.body)).timeSec).toBe(2)
	globalThis.fetch = Object.assign(async () => Response.json({ code: 400 }), {
		preconnect: originalFetch.preconnect,
	})
	await expect(sendCommand(defaults, {})).rejects.toThrow('rejected')
	globalThis.fetch = Object.assign(
		async () => new Response('', { status: 503 }),
		{ preconnect: originalFetch.preconnect },
	)
	await expect(sendCommand(defaults, {})).rejects.toThrow('503')
})
