import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ReactNode } from 'react'
import type { NotificationItem } from './types'

interface Markup {
	parse(
		content: string,
		inline: boolean,
		context: {
			channelId?: string
			guildId?: string
			messageId?: string
			allowLinks: boolean
		},
	): ReactNode
	parseTopic: unknown
}
export function renderNotificationContent(item: NotificationItem): ReactNode {
	const [markup] = lookupModule(withProps<Markup>('parse', 'parseTopic'))
	if (!markup) throw new Error('Discord message markup renderer is unavailable')
	return markup.parse(item.content, true, {
		channelId: item.channelId,
		guildId: item.guildId,
		messageId: item.messageId,
		allowLinks: true,
	})
}
