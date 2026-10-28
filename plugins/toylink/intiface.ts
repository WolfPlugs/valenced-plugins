import { bounded, record } from './control'
import type { Settings } from './control'

type Device = { index: number; name: string; actuators: number[] }
type Reply = { type: string; body: Record<string, unknown> }

export function websocketUrl(endpoint: string): string {
	const url = new URL(endpoint.trim())
	if (
		!['ws:', 'wss:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.hash
	)
		throw new Error(
			'Enter an Intiface WebSocket address, such as ws://192.168.1.10:12345.',
		)
	return url.toString()
}

export function vibrationDevices(value: unknown): Device[] {
	if (!Array.isArray(value))
		throw new Error('Intiface returned an invalid device list.')
	return value.flatMap(device => {
		if (
			!record(device) ||
			typeof device.DeviceIndex !== 'number' ||
			!Number.isSafeInteger(device.DeviceIndex) ||
			device.DeviceIndex < 0 ||
			typeof device.DeviceName !== 'string' ||
			!record(device.DeviceMessages) ||
			!Array.isArray(device.DeviceMessages.ScalarCmd)
		)
			return []
		const actuators = device.DeviceMessages.ScalarCmd.flatMap(
			(feature, index) =>
				record(feature) && feature.ActuatorType === 'Vibrate' ? [index] : [],
		)
		return actuators.length
			? [{ index: device.DeviceIndex, name: device.DeviceName, actuators }]
			: []
	})
}

export class IntifaceSession {
	private socket: WebSocket
	private nextId = 1
	private closed = false
	private ready = false
	private ending = false
	private closeError = new Error('Intiface disconnected.')
	private ping?: ReturnType<typeof setInterval>
	private cancelWait?: () => void
	private rejectOpen?: (error: Error) => void
	private pending = new Map<
		number,
		{
			resolve(reply: Reply): void
			reject(error: Error): void
			timer: ReturnType<typeof setTimeout>
		}
	>()
	private opened: Promise<void>
	private stopping?: Promise<void>

	constructor(endpoint: string) {
		this.socket = new WebSocket(websocketUrl(endpoint))
		this.opened = new Promise((resolve, reject) => {
			this.rejectOpen = reject
			const timer = setTimeout(
				() => this.close(new Error('Intiface connection timed out.')),
				5000,
			)
			this.socket.onopen = () => {
				clearTimeout(timer)
				this.rejectOpen = undefined
				resolve()
			}
			this.socket.onclose = () => {
				clearTimeout(timer)
				this.close(new Error('Intiface disconnected.'))
			}
			this.socket.onerror = () => {
				clearTimeout(timer)
				this.close(
					new Error(
						'Unable to connect to Intiface. Start its server and check the address.',
					),
				)
			}
		})
		this.socket.onmessage = event => {
			try {
				const messages: unknown = JSON.parse(String(event.data))
				if (!Array.isArray(messages))
					throw new Error('Invalid Intiface message.')
				for (const message of messages) {
					if (!record(message)) throw new Error('Invalid Intiface message.')
					for (const [type, body] of Object.entries(message)) {
						if (!record(body) || typeof body.Id !== 'number') continue
						const request = this.pending.get(body.Id)
						if (!request) continue
						clearTimeout(request.timer)
						this.pending.delete(body.Id)
						if (type === 'Error')
							request.reject(
								new Error(
									typeof body.ErrorMessage === 'string'
										? body.ErrorMessage
										: 'Intiface rejected the command.',
								),
							)
						else request.resolve({ type, body })
					}
				}
			} catch {
				this.close(new Error('Intiface sent an invalid response.'))
			}
		}
	}

	private request(
		type: string,
		body: object = {},
		expected = 'Ok',
	): Promise<Record<string, unknown>> {
		if (
			this.closed ||
			(this.ending && type !== 'StopAllDevices') ||
			this.socket.readyState !== WebSocket.OPEN
		)
			return Promise.reject(new Error('Intiface connection is closed.'))
		const id = this.nextId++
		return new Promise<Reply>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error('Intiface command timed out.'))
			}, 5000)
			this.pending.set(id, { resolve, reject, timer })
			try {
				this.socket.send(JSON.stringify([{ [type]: { ...body, Id: id } }]))
			} catch {
				clearTimeout(timer)
				this.pending.delete(id)
				reject(new Error('Unable to send an Intiface command.'))
			}
		}).then(reply => {
			if (reply.type !== expected)
				throw new Error(`Expected ${expected} from Intiface.`)
			return reply.body
		})
	}

	async connect(): Promise<Device[]> {
		await this.opened
		const server = await this.request(
			'RequestServerInfo',
			{ ClientName: 'Valenced ToyLink', MessageVersion: 3 },
			'ServerInfo',
		)
		if (
			server.MessageVersion !== 3 ||
			typeof server.MaxPingTime !== 'number' ||
			!Number.isFinite(server.MaxPingTime) ||
			server.MaxPingTime < 0
		)
			throw new Error('Intiface must support Buttplug protocol v3.')
		this.ready = true
		if (server.MaxPingTime > 0)
			this.ping = setInterval(
				() => {
					void this.request('Ping').catch(() =>
						this.close(new Error('Intiface heartbeat failed.')),
					)
				},
				Math.max(1, Math.floor(server.MaxPingTime / 2)),
			)
		const list = await this.request('RequestDeviceList', {}, 'DeviceList')
		return vibrationDevices(list.Devices)
	}

	async pulse(settings: Settings, devices: Device[]): Promise<void> {
		const selection = settings.deviceIndex.trim()
		if (selection && !/^\d+$/.test(selection))
			throw new Error(
				'Intiface device index must be a non-negative integer or blank for all.',
			)
		const selected = selection
			? devices.filter(device => device.index === Number(selection))
			: devices
		if (!selected.length)
			throw new Error(
				'No matching vibration-capable devices. Scan and connect your toy in Intiface first.',
			)
		let expired = false
		const elapsed = new Promise<void>(resolve => {
			this.cancelWait = resolve
		})
		const timer = setTimeout(
			() => {
				expired = true
				this.cancelWait?.()
				void this.stop().catch(() => {})
			},
			bounded(settings.duration, 2, 10) * 1000,
		)
		try {
			for (const device of selected) {
				await this.request('ScalarCmd', {
					DeviceIndex: device.index,
					Scalars: device.actuators.map(Index => ({
						Index,
						Scalar: bounded(settings.strength, 1, 20) / 20,
						ActuatorType: 'Vibrate',
					})),
				})
			}
			await elapsed
			if (this.closed && !expired) throw this.closeError
		} catch (error) {
			if (!expired) throw error
		} finally {
			clearTimeout(timer)
			this.cancelWait = undefined
		}
	}

	stop(): Promise<void> {
		if (this.stopping) return this.stopping
		this.ending = true
		clearInterval(this.ping)
		this.stopping = (async () => {
			try {
				if (this.ready && !this.closed) await this.request('StopAllDevices')
			} finally {
				this.close()
			}
		})()
		return this.stopping
	}

	close(error = new Error('Intiface session ended.')) {
		if (this.closed) return
		this.closed = true
		this.closeError = error
		clearInterval(this.ping)
		this.cancelWait?.()
		this.rejectOpen?.(error)
		for (const request of this.pending.values()) {
			clearTimeout(request.timer)
			request.reject(error)
		}
		this.pending.clear()
		this.socket.close()
	}
}
