import { Design } from '@valenced/discord/design'
import { React } from '@valenced/react'
import { renderNotificationContent } from '../lib/markup'
import { useInbox } from './context'
import type { NotificationItem } from '../lib/types'

export function MessageContent({ item }: { item: NotificationItem }) {
	const { reportError } = useInbox()
	const preview = React.useMemo(() => {
		try {
			return { content: renderNotificationContent(item) }
		} catch (error) {
			return { content: item.content, error }
		}
	}, [item.content, item.channelId, item.guildId, item.messageId])
	React.useEffect(() => {
		if (preview.error) reportError(preview.error)
	}, [preview, reportError])
	return (
		<Design.Text variant="text-sm/normal" numberOfLines={3}>
			{preview.content}
		</Design.Text>
	)
}
