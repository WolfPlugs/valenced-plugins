import { Page } from '@valenced/components'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { InboxContext } from './context'
import { NotificationActionsKey, InboxSheetKey as SheetKey } from './keys'
import NotificationCenter from './NotificationCenter'
import type { ComponentType, ReactNode } from 'react'
import type { InboxController } from './context'

interface Navigation {
	pushLazy: unknown
	push(render: () => ReactNode): void
	pop(): void
}
interface NavigatorProps {
	initialRouteName: string
	goBackOnBackPress: boolean
	screens: Record<
		string,
		{ title: string; headerLeft?: ReactNode; render(): ReactNode }
	>
}

export function openNotificationCenter(controller: InboxController) {
	try {
		const [navigation] = lookupModule(
			withProps<Navigation>('push', 'pushLazy', 'pop'),
		)
		const [navigator] = lookupModule(
			withProps<{ Navigator: ComponentType<NavigatorProps> }>('Navigator'),
		)
		const [header] = lookupModule(
			withProps<{
				getRenderCloseButton: unknown
				getHeaderCloseButton(close: () => void): ReactNode
			}>('getHeaderCloseButton', 'getRenderCloseButton'),
		)
		if (navigation && navigator?.Navigator) {
			const { Navigator } = navigator
			navigation.push(() => (
				<InboxContext.Provider value={controller}>
					<Navigator
						initialRouteName="BetterInbox"
						goBackOnBackPress
						screens={{
							BetterInbox: {
								title: 'Inbox',
								headerLeft: header?.getHeaderCloseButton(() =>
									navigation.pop(),
								),
								render: () => (
									<Page>
										<NotificationCenter />
									</Page>
								),
							},
						}}
					/>
				</InboxContext.Provider>
			))
			return
		}
		const { ActionSheet, BottomSheetTitleHeader, Button } = Design
		const Sheet = () => (
			<InboxContext.Provider value={controller}>
				<ActionSheet
					startExpanded
					header={
						<BottomSheetTitleHeader
							title="Inbox"
							trailing={
								<Button
									text="Close"
									size="sm"
									variant="tertiary"
									onPress={() =>
										ActionSheetActionCreators.hideActionSheet(SheetKey)
									}
								/>
							}
						/>
					}
				>
					<NotificationCenter />
				</ActionSheet>
			</InboxContext.Provider>
		)
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: Sheet }),
			SheetKey,
			{},
		)
	} catch (error) {
		controller.reportError(error)
	}
}
export function closeInboxSheets() {
	ActionSheetActionCreators.hideActionSheet(SheetKey)
	ActionSheetActionCreators.hideActionSheet(NotificationActionsKey)
}
