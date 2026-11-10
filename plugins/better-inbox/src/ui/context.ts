import { React } from '@valenced/react'
import type { JsonStorage } from '@valenced/json-storage'
import type { Inbox } from '../lib/inbox'
import type { BetterInboxStorage } from '../lib/types'

export interface InboxController {
	refreshHistory?(): Promise<void>
	inbox: Inbox
	storage: JsonStorage<BetterInboxStorage>
	reportError(error: unknown): void
}
export const InboxContext = React.createContext<InboxController | undefined>(
	undefined,
)
export function useInbox() {
	const controller = React.useContext(InboxContext)
	if (!controller) throw new Error('BetterInbox is not running')
	return controller
}
