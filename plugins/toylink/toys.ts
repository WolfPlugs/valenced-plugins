import { functionCommand, sendCommand } from './control'
import { IntifaceSession } from './intiface'
import type { Settings } from './control'

let session: IntifaceSession | undefined
let target: Settings | undefined
let pending: Promise<unknown> = Promise.resolve()
let cancelled = false
let busy = false
let stopping: Promise<void> | undefined

export function stopToys(settings?: Settings): Promise<void> {
	if (stopping) return stopping
	cancelled = true
	const current = session
	const last = target ?? settings
	stopping = (async () => {
		if (current) return current.stop()
		if (last?.backend === 'lovense') {
			await pending.catch(() => {})
			await sendCommand(last, functionCommand(last, true))
		}
	})().finally(() => {
		stopping = undefined
	})
	return stopping
}

export async function useToys(
	settings: Settings,
	action: 'check' | 'pulse',
): Promise<string> {
	if (busy || stopping)
		throw new Error(
			'ToyLink is busy. Stop the current pulse or wait for it to finish.',
		)
	busy = true
	cancelled = false
	target = settings
	try {
		if (settings.backend === 'lovense') {
			pending = sendCommand(
				settings,
				action === 'check' ? { command: 'GetToys' } : functionCommand(settings),
			)
			await pending
			return 'Lovense Remote accepted the command.'
		}
		const current = new IntifaceSession(settings.intifaceEndpoint)
		session = current
		try {
			const devices = await current.connect()
			if (action === 'pulse') await current.pulse(settings, devices)
			return devices.length
				? devices.map(device => `${device.index}: ${device.name}`).join('\n')
				: 'Connected. No vibration-capable toys found. Scan for devices in Intiface.'
		} finally {
			if (action === 'pulse') await current.stop()
			else current.close()
		}
	} catch (error) {
		if (!cancelled) throw error
		return 'Stopped.'
	} finally {
		session = undefined
		busy = false
	}
}
