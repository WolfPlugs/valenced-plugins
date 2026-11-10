import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import type { NotificationCategory } from '../lib/types'
import type { InboxController } from './context'

const AlertKey = 'wolfie.better-inbox.clear'
export function dismissClearConfirmation() {
	AlertActionCreators.dismissAlert(AlertKey)
}
export function confirmClear(
	controller: InboxController,
	category?: NotificationCategory,
) {
	const { View } = ReactNative
	try {
		AlertActionCreators.openAlert(
			AlertKey,
			<Design.AlertModal
				title={
					category ? 'Clear these notifications?' : 'Clear all notifications?'
				}
				content={
					<Design.Text>
						Are you sure you want to do this? This clears your BetterInbox
						history. Your Discord friend requests will stay unchanged.
					</Design.Text>
				}
				actions={
					<View style={{ gap: 8 }}>
						<Design.Button
							text="Cancel"
							variant="secondary"
							onPress={dismissClearConfirmation}
						/>
						<Design.Button
							text="Clear notifications"
							variant="destructive"
							onPress={() => {
								dismissClearConfirmation()
								controller.inbox.clear(category)
							}}
						/>
					</View>
				}
			/>,
		)
	} catch (error) {
		controller.reportError(error)
	}
}
