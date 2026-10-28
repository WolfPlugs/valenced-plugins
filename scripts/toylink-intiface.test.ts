import { afterEach, expect, test } from 'bun:test'
import { defaults, record } from '../plugins/toylink/control'
import { vibrationDevices, websocketUrl } from '../plugins/toylink/intiface'
import { stopToys, useToys } from '../plugins/toylink/toys'

const devices = [
	{
		DeviceIndex: 7,
		DeviceName: 'Mixed toy',
		DeviceMessages: {
			ScalarCmd: [
				{ ActuatorType: 'Inflate' },
				{ ActuatorType: 'Vibrate' },
				{ ActuatorType: 'Vibrate' },
			],
		},
	},
	{
		DeviceIndex: 9,
		DeviceName: 'Other toy',
		DeviceMessages: { ScalarCmd: [{ ActuatorType: 'Vibrate' }] },
	},
	{
		DeviceIndex: 10,
		DeviceName: 'Stroker',
		DeviceMessages: { LinearCmd: [{}] },
	},
]

function serve(
	mode: 'normal' | 'reject' | 'disconnect' | 'wrongVersion' = 'normal',
) {
	const requests: { type: string; body: Record<string, unknown> }[] = []
	let didVibrate: () => void = () => {}
	const vibrating = new Promise<void>(resolve => {
		didVibrate = resolve
	})
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch(request, server) {
			return server.upgrade(request)
				? undefined
				: new Response('', { status: 400 })
		},
		websocket: {
			message(socket, data) {
				const parsed: unknown = JSON.parse(String(data))
				if (!Array.isArray(parsed)) throw new Error('Expected message array')
				for (const message of parsed) {
					if (!record(message)) throw new Error('Expected message')
					for (const [type, body] of Object.entries(message)) {
						if (!record(body)) throw new Error('Expected body')
						requests.push({ type, body })
						const reply = { Ok: { Id: body.Id } }
						if (type === 'RequestServerInfo') {
							expect(body.MessageVersion).toBe(3)
							socket.send(
								JSON.stringify([
									{
										ServerInfo: {
											Id: body.Id,
											MessageVersion: mode === 'wrongVersion' ? 2 : 3,
											MaxPingTime: 200,
											ServerName: 'Test',
										},
									},
								]),
							)
							continue
						}
						if (type === 'RequestDeviceList') {
							socket.send(
								JSON.stringify([
									{ DeviceList: { Id: body.Id, Devices: devices } },
								]),
							)
							continue
						}
						if (type === 'ScalarCmd') {
							didVibrate()
							if (mode === 'disconnect') {
								socket.close()
								continue
							}
							if (mode === 'reject') {
								socket.send(
									JSON.stringify([
										{
											Error: {
												Id: body.Id,
												ErrorMessage: 'Device unavailable',
												ErrorCode: 2,
											},
										},
									]),
								)
								continue
							}
						}
						socket.send(JSON.stringify([reply]))
					}
				}
			},
		},
	})
	return {
		server,
		requests,
		vibrating,
		settings: {
			...defaults,
			backend: 'intiface',
			intifaceEndpoint: `ws://127.0.0.1:${server.port}`,
			deviceIndex: '7',
		} as const,
	}
}

let running: ReturnType<typeof serve> | undefined
afterEach(async () => {
	await stopToys()
	running?.server.stop(true)
	running = undefined
})

test('only vibration features are selected, preserving original actuator indices', () => {
	expect(vibrationDevices(devices)).toEqual([
		{ index: 7, name: 'Mixed toy', actuators: [1, 2] },
		{ index: 9, name: 'Other toy', actuators: [0] },
	])
	expect(() => vibrationDevices({})).toThrow()
	expect(websocketUrl('ws://127.0.0.1:12345')).toBe('ws://127.0.0.1:12345/')
	expect(() => websocketUrl('https://example.com')).toThrow()
})

test('connection check lists vibrating devices without actuating', async () => {
	running = serve()
	expect(await useToys(running.settings, 'check')).toBe(
		'7: Mixed toy\n9: Other toy',
	)
	expect(running.requests.map(request => request.type)).toEqual([
		'RequestServerInfo',
		'RequestDeviceList',
	])
})

test('finite pulse sends selected actuators, heartbeat and acknowledged stop', async () => {
	running = serve()
	await useToys(running.settings, 'pulse')
	expect(
		running.requests.find(request => request.type === 'ScalarCmd')?.body,
	).toMatchObject({
		DeviceIndex: 7,
		Scalars: [
			{ Index: 1, Scalar: 0.15, ActuatorType: 'Vibrate' },
			{ Index: 2, Scalar: 0.15, ActuatorType: 'Vibrate' },
		],
	})
	expect(running.requests.some(request => request.type === 'Ping')).toBe(true)
	expect(running.requests.at(-1)?.type).toBe('StopAllDevices')
})

test('stop interrupts a manual pulse and prevents overlapping commands', async () => {
	running = serve()
	const pulse = useToys(running.settings, 'pulse')
	await running.vibrating
	await expect(useToys(running.settings, 'pulse')).rejects.toThrow('busy')
	await stopToys()
	expect(await pulse).toBe('Stopped.')
	expect(
		running.requests.filter(request => request.type === 'StopAllDevices'),
	).toHaveLength(1)
	expect(running.requests.at(-1)?.type).toBe('StopAllDevices')
})

test('stop during connection setup never sends vibration', async () => {
	running = serve()
	const pulse = useToys(running.settings, 'pulse')
	await stopToys()
	expect(await pulse).toBe('Stopped.')
	expect(running.requests.some(request => request.type === 'ScalarCmd')).toBe(
		false,
	)
})

test('device rejection, disconnect, unsupported version and missing selection fail clearly', async () => {
	for (const mode of ['reject', 'disconnect', 'wrongVersion'] as const) {
		running = serve(mode)
		await expect(useToys(running.settings, 'pulse')).rejects.toThrow()
		running.server.stop(true)
	}
	running = serve()
	await expect(
		useToys({ ...running.settings, deviceIndex: '10' }, 'pulse'),
	).rejects.toThrow('No matching')
	await expect(
		useToys({ ...running.settings, deviceIndex: 'invalid' }, 'pulse'),
	).rejects.toThrow('index')
})
