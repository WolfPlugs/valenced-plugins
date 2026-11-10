import { Stores } from '@valenced/discord/flux'
import type { InboxStores } from './discordTypes'

// Discord's store registry erases each store's methods. Keep that cast at the API boundary.
export function getStores(): InboxStores {
	return Stores as unknown as InboxStores
}
export function getOwner() {
	return getStores().UserStore?.getCurrentUser()?.id
}
