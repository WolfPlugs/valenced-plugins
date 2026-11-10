import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { React, ReactNative } from '@valenced/react'
import { DEFAULT_STORAGE } from '../lib/types'
import { confirmClear } from './confirmClear'
import { useInbox } from './context'
import { openNotificationCenter } from './openInbox'
import type { BetterInboxStorage } from '../lib/types'

type ToggleKey = Exclude<
	keyof BetterInboxStorage,
	'notifications' | 'maxStored' | 'owner' | 'dismissed' | 'clearedAt'
>
const Tracking: { key: ToggleKey; label: string; description: string }[] = [
	{
		key: 'trackMentions',
		label: 'Mentions',
		description: 'Direct and role mentions.',
	},
	{
		key: 'trackReplies',
		label: 'Replies',
		description: 'Replies to your messages.',
	},
	{
		key: 'trackReactions',
		label: 'Reactions',
		description: 'Reactions to your cached messages.',
	},
	{
		key: 'trackFriendRequests',
		label: 'Friend requests',
		description: 'Incoming and accepted friend requests.',
	},
	{
		key: 'trackThreads',
		label: 'Threads',
		description: 'When you are added to a thread.',
	},
	{
		key: 'trackPresence',
		label: 'Friend status updates',
		description: "Changes to friends' custom status messages.",
	},
]
export default function Settings() {
	const controller = useInbox()
	const { storage, inbox, reportError } = controller
	const settings = storage.use()
	const items = React.useSyncExternalStore(inbox.subscribe, inbox.getSnapshot)
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRow, Button } = Design
	function toggle(key: ToggleKey, label: string, description: string) {
		return (
			<TableSwitchRow
				key={key}
				label={label}
				subLabel={description}
				value={settings?.[key] ?? DEFAULT_STORAGE[key] ?? false}
				onValueChange={value => {
					void storage.set({ [key]: value }).catch(reportError)
				}}
			/>
		)
	}
	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
				<Stack spacing={16}>
					<Button
						text="Open notification center"
						onPress={() => openNotificationCenter(controller)}
					/>
					<TableRowGroup title="Integration">
						{toggle(
							'showYouBarButton',
							'Replace You bar notifications button',
							'Open BetterInbox when tapping the notification bell.',
						)}
						{toggle(
							'blockSystemNotifications',
							'Block in-app banners and sounds',
							'Suppress in-app notifications while keeping inbox tracking active.',
						)}
					</TableRowGroup>
					<TableRowGroup title="Tracking">
						{Tracking.map(({ key, label, description }) =>
							toggle(key, label, description),
						)}
					</TableRowGroup>
					<TableRowGroup title="Storage">
						<TableRow
							label="Clear all notifications"
							subLabel={`${items.length} notifications stored on this device. Each category keeps its own history limit.`}
							variant="danger"
							onPress={() => confirmClear(controller)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
