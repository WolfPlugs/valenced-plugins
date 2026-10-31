import { expect, test } from 'bun:test'
import { sendDesktopHeartbeat } from '../plugins/questify/completion/desktop-heartbeat'
import { questRequestError } from '../plugins/questify/completion/requests'

test('desktop heartbeats use the native sender and preserve terminal state', async () => {
	const requests: unknown[] = []
	for (const terminal of [false, true]) {
		await sendDesktopHeartbeat(
			async (...args) => {
				requests.push(args)
				return JSON.stringify({ status: 200, body: '{}' })
			},
			'12345',
			'45678',
			terminal,
			'test-session',
		)
	}
	expect(requests).toEqual([
		['12345', '45678', false, 'test-session'],
		['12345', '45678', true, 'test-session'],
	])
})

test('native server rejection retains the HTTP status and Discord code', async () => {
	await expect(
		sendDesktopHeartbeat(
			async () =>
				JSON.stringify({
					status: 401,
					body: JSON.stringify({ message: 'Unauthorized', code: 40001 }),
				}),
			'12345',
			'45678',
			false,
			'test-session',
		),
	).rejects.toThrow(
		'[Native heartbeat] Discord quest request failed HTTP 401: Unauthorized (Discord code 40001)',
	)
})

test('invalid native responses and transport failures never report success', async () => {
	for (const result of [
		undefined,
		'{}',
		'{"status":200,"body":null}',
		'invalid JSON',
	]) {
		await expect(
			sendDesktopHeartbeat(
				async () => result,
				'12345',
				'45678',
				false,
				'test-session',
			),
		).rejects.toThrow()
	}
	await expect(
		sendDesktopHeartbeat(
			async () => {
				throw new Error('Native component unavailable')
			},
			'12345',
			'45678',
			false,
			'test-session',
		),
	).rejects.toThrow('Native component unavailable')
})

test('nested HTTP errors retain status and code without serializing request credentials', () => {
	const error = questRequestError({
		hasErr: true,
		err: {
			status: 401,
			body: { message: 'Unauthorized', code: 40001 },
			headers: { Authorization: 'must-never-appear' },
		},
	})
	expect(error.message).toContain('HTTP 401: Unauthorized (Discord code 40001)')
	expect(error.message).not.toContain('must-never-appear')
})
