import { snapshotAuthor, timestamp } from './shared'
import type { EventPayload } from '../discordTypes'
import type { EventContext } from './shared'

export function createActivityHandlers({
	stores,
	getSettings,
	pushNotification,
	reportError,
}: EventContext) {
	const signatures = new Map<string, string>()
	let sequence = 0
	function update(payload: EventPayload) {
		const user = payload.user
		if (!user?.id || user.bot) return
		const current = stores()
		const me = current.UserStore?.getCurrentUser()
		if (
			!me ||
			user.id === me.id ||
			!current.RelationshipStore?.getFriendIDs().includes(user.id)
		)
			return
		const status = payload.activities?.find(activity => activity.type === 4)
		const text = status?.state || ''
		const emoji = status?.emoji?.name || ''
		const signature = JSON.stringify([text, emoji])
		if (signatures.get(user.id) === signature) return
		signatures.set(user.id, signature)
		if (!text && !emoji) return
		pushNotification({
			id: `presence-${user.id}-${Date.now()}-${sequence++}`,
			category: 'other',
			title: `${user.globalName || user.username} updated their status`,
			content: [emoji ? `:${emoji}:` : '', text].filter(Boolean).join(' '),
			guildName: '',
			channelName: '',
			createdAt: Date.now(),
			timestamp: timestamp(),
			author: snapshotAuthor(user),
		})
	}
	return {
		handle(payload: EventPayload) {
			if (getSettings()?.trackPresence !== true) return
			for (const entry of payload.updates ?? []) {
				try {
					update(entry)
				} catch (error) {
					reportError(error)
				}
			}
		},
		reset: () => signatures.clear(),
	}
}
