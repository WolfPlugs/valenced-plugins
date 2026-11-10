import { React } from '@valenced/react'
import type { LogoutResult } from '../lib/logout'
import type { SessionTracker } from '../lib/sessions'

export type DeviceController = {
	tracker: SessionTracker
	getCurrentHash(): string | undefined
	logout(hashes: readonly string[]): Promise<LogoutResult>
	reportError(error: unknown): void
}

export type DevicesContextValue = {
	selected: readonly string[]
	busy: boolean
	fresh: readonly string[]
	toggle(hash: string): void
	confirm(hashes: readonly string[]): void
}

export const DevicesContext = React.createContext<DevicesContextValue | null>(
	null,
)

export function useDevices() {
	const context = React.useContext(DevicesContext)
	if (!context)
		throw new Error('Device controls must be inside the Devices screen')
	return context
}
