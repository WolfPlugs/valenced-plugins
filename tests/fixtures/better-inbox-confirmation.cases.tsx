import { expect, mock, test } from 'bun:test'
import type { ReactElement } from 'react'
import type { NotificationCategory } from '../../plugins/better-inbox/src/lib/types'
import type { InboxController } from '../../plugins/better-inbox/src/ui/context'

type Alert = ReactElement<{
	title: string
	content: ReactElement<{ children: string }>
	actions: ReactElement<{ children: ReactElement<{ onPress(): void }>[] }>
}>
let alert: Alert | undefined
const dismissed: string[] = []
mock.module('@valenced/discord/actions', () => ({
	AlertActionCreators: {
		openAlert(_key: string, node: Alert) {
			alert = node
		},
		dismissAlert(key: string) {
			dismissed.push(key)
			alert = undefined
		},
	},
}))
const Component = () => null
mock.module('@valenced/discord/design', () => ({
	Design: { AlertModal: Component, Text: Component, Button: Component },
}))
mock.module('@valenced/react', () => ({ ReactNative: { View: Component } }))
const { confirmClear, dismissClearConfirmation } = await import(
	'../../plugins/better-inbox/src/ui/confirmClear'
)

test('cancel does nothing; confirming clears exactly the selected category', () => {
	const cleared: (NotificationCategory | undefined)[] = []
	const controller = {
		inbox: {
			clear: (category?: NotificationCategory) => cleared.push(category),
		},
		reportError(error: unknown) {
			throw error
		},
	} as unknown as InboxController
	confirmClear(controller)
	const all = alert
	if (!all) throw new Error('Missing confirmation')
	expect(all.props.title).toBe('Clear all notifications?')
	expect(all.props.content.props.children).toContain(
		'friend requests will stay unchanged',
	)
	expect(cleared).toEqual([])
	all.props.actions.props.children[0]?.props.onPress()
	expect(cleared).toEqual([])
	confirmClear(controller, 'friend_request')
	const friends = alert
	if (!friends) throw new Error('Missing category confirmation')
	friends.props.actions.props.children[1]?.props.onPress()
	expect(cleared).toEqual(['friend_request'])
	confirmClear(controller)
	const confirmed = alert
	if (!confirmed) throw new Error('Missing all confirmation')
	confirmed.props.actions.props.children[1]?.props.onPress()
	expect(cleared).toEqual(['friend_request', undefined])
	dismissClearConfirmation()
	expect(dismissed.every(key => key === 'wolfie.better-inbox.clear')).toBe(true)
})
