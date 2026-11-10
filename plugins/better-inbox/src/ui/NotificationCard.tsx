import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import {
	getAvatarUrl,
	navigateToChannel,
	openUserProfile,
} from '../lib/navigation'
import { useInbox } from './context'
import { openNotificationContextMenu } from './NotificationContextMenu'
import type { NotificationItem } from '../lib/types'

export function NotificationCard({ item }: { item: NotificationItem }) {
	const controller = useInbox()
	const { Card, Text, Button } = Design
	const { View, Image } = ReactNative
	const location = [item.guildName, item.channelName]
		.filter(Boolean)
		.join(' • ')
	async function open() {
		try {
			if (
				(item.category === 'friend_request' ||
					(!item.channelId && !item.guildId)) &&
				item.author
			) {
				await openUserProfile(item.author.id, item.guildId)
			} else navigateToChannel(item.guildId, item.channelId, item.messageId)
		} catch (error) {
			controller.reportError(error)
		}
	}
	return (
		<Card style={{ padding: 12, gap: 8 }}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				{item.author && (
					<Image
						source={{ uri: getAvatarUrl(item.author) }}
						style={{ width: 28, height: 28, borderRadius: 14 }}
					/>
				)}
				<Text variant="text-sm/semibold" style={{ flex: 1 }}>
					{item.title}
				</Text>
				<Text variant="text-xs/normal" color="text-muted">
					{item.timestamp}
				</Text>
			</View>
			{Boolean(item.content) && (
				<Text variant="text-sm/normal" numberOfLines={2}>
					{item.content}
				</Text>
			)}
			{Boolean(location) && (
				<Text variant="text-xs/normal" color="text-muted">
					{location}
				</Text>
			)}
			<View style={{ flexDirection: 'row', gap: 8 }}>
				<Button
					text={
						item.channelId
							? 'Jump to message'
							: item.guildId
								? 'Open server'
								: 'View profile'
					}
					size="sm"
					variant="secondary"
					disabled={!item.channelId && !item.guildId && !item.author}
					onPress={open}
				/>
				<Button
					text="More"
					accessibilityLabel={`Actions for ${item.title}`}
					size="sm"
					variant="tertiary"
					onPress={() => openNotificationContextMenu(item, controller)}
				/>
			</View>
		</Card>
	)
}
