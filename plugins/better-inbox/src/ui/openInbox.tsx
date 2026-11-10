import { Page } from '@valenced/components'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { CloseButton } from './CloseButton'
import { dismissClearConfirmation } from './confirmClear'
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
		{ title: string; headerLeft?: () => ReactNode; render(): ReactNode }
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
				getHeaderCloseButton(close: () => void): () => ReactNode
			}>('getHeaderCloseButton'),
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
								headerLeft:
									header?.getHeaderCloseButton(() => navigation.pop()) ??
									(() => <CloseButton onPress={() => navigation.pop()} />),
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
		const { ActionSheet, BottomSheetTitleHeader } = Design
		const Sheet = () => (
			<InboxContext.Provider value={controller}>
				<ActionSheet
					startExpanded
					header={
						<BottomSheetTitleHeader
							title="Inbox"
							leading={
								<CloseButton
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
	dismissClearConfirmation()
	ActionSheetActionCreators.hideActionSheet(SheetKey)
	ActionSheetActionCreators.hideActionSheet(NotificationActionsKey)
}
