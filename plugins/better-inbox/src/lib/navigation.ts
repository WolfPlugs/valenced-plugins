import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { getUserProfileOpener } from './profile'
import type { NotificationAuthor } from './types'

interface Router {
	transitionToGuild(
		guildId: string,
		channelId?: string,
		messageId?: string,
	): void
}

export function navigateToChannel(
	guildId?: string,
	channelId?: string,
	messageId?: string,
) {
	if (!guildId && !channelId) return
	const [router] = lookupModule(withProps<Router>('transitionToGuild'))
	if (!router) throw new Error('Discord channel navigation is unavailable')
	router.transitionToGuild(guildId || '@me', channelId, messageId)
}
export async function openUserProfile(userId: string, guildId?: string) {
	const open = getUserProfileOpener()
	if (!open) throw new Error('Discord user profile action sheet is unavailable')
	await open({ userId, guildId, ignoreBlockedSpeedBump: false })
}

export function getAvatarUrl(author?: NotificationAuthor): string {
	if (author?.avatar) {
		const ext = author.avatar.startsWith('a_') ? 'gif' : 'png'
		return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=128`
	}
	let index = 0
	if (author && /^\d+$/.test(author.id)) {
		index =
			author.discriminator &&
			/^\d+$/.test(author.discriminator) &&
			author.discriminator !== '0'
				? Number(author.discriminator) % 5
				: Number((BigInt(author.id) >> 22n) % 6n)
	}
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
