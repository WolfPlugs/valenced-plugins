import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { navigateToChannel, openUserProfile } from '../lib/navigation'
import { NotificationActionsKey } from './keys'
import type { NotificationItem } from '../lib/types'
import type { InboxController } from './context'

export function openNotificationContextMenu(
	item: NotificationItem,
	controller: InboxController,
) {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		Button,
		TableRowGroup,
		TableRow,
		Stack,
	} = Design
	const close = () =>
		ActionSheetActionCreators.hideActionSheet(NotificationActionsKey)
	function run(action: () => unknown) {
		close()
		try {
			void Promise.resolve(action()).catch(controller.reportError)
		} catch (error) {
			controller.reportError(error)
		}
	}
	function copy(text: string, label: string) {
		run(() => {
			Clipboard.setString(text)
			ToastActionCreators.open({
				key: 'better-inbox-copied',
				content: `Copied ${label}`,
			})
		})
	}
	const fields: [string, string | undefined][] = [
		['User ID', item.author?.id],
		['Message ID', item.messageId],
		['Channel ID', item.channelId],
		['Server ID', item.guildId === '@me' ? undefined : item.guildId],
		['Message content', item.content],
	]
	function Sheet() {
		return (
			<ActionSheet
				scrollable
				header={
					<BottomSheetTitleHeader
						title="Notification actions"
						subtitle={item.title}
						trailing={
							<Button
								text="Close"
								size="sm"
								variant="tertiary"
								onPress={close}
							/>
						}
					/>
				}
			>
				<Stack spacing={16} style={{ paddingBottom: 24 }}>
					{(item.channelId || item.guildId || item.author) && (
						<TableRowGroup title="Navigation">
							{item.channelId && (
								<TableRow
									label="Jump to channel / message"
									subLabel={item.channelName}
									onPress={() =>
										run(() =>
											navigateToChannel(
												item.guildId,
												item.channelId,
												item.messageId,
											),
										)
									}
								/>
							)}
							{item.guildId && item.guildId !== '@me' && (
								<TableRow
									label="Jump to server"
									subLabel={item.guildName}
									onPress={() => run(() => navigateToChannel(item.guildId))}
								/>
							)}
							{item.author && (
								<TableRow
									label="View profile"
									onPress={() =>
										run(() => {
											if (item.author)
												return openUserProfile(item.author.id, item.guildId)
										})
									}
								/>
							)}
						</TableRowGroup>
					)}
					{fields.some(([, value]) => Boolean(value)) && (
						<TableRowGroup title="Copy information">
							{fields.map(
								([label, value]) =>
									value && (
										<TableRow
											key={label}
											label={`Copy ${label}`}
											subLabel={value}
											subLabelLineClamp={1}
											onPress={() => copy(value, label)}
										/>
									),
							)}
						</TableRowGroup>
					)}
					<TableRowGroup>
						<TableRow
							label="Remove from inbox"
							variant="danger"
							onPress={() => run(() => controller.inbox.delete(item.id))}
						/>
					</TableRowGroup>
				</Stack>
			</ActionSheet>
		)
	}
	try {
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: Sheet }),
			NotificationActionsKey,
			{},
		)
	} catch (error) {
		controller.reportError(error)
	}
}
