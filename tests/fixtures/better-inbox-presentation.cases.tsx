import { expect, mock, test } from 'bun:test'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { NotificationItem } from '../../plugins/better-inbox/src/lib/types'
import type { InboxController } from '../../plugins/better-inbox/src/ui/context'

let route: (() => ReactNode) | undefined
let pops = 0
let nativeHeader = true
const parsed = React.createElement('FormattedMessage')
const parse = mock(() => parsed)
const navigation = {
	push(render: () => ReactNode) {
		route = render
	},
	pop() {
		pops++
	},
}
const Navigator = () => null
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: (...props: string[]) => props,
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule: (props: string[]) => {
		if (props[0] === 'parse') return [{ parse, parseTopic() {} }]
		if (props[0] === 'push') return [navigation]
		if (props[0] === 'Navigator') return [{ Navigator }]
		if (props[0] === 'getHeaderCloseButton') {
			expect(props).toEqual(['getHeaderCloseButton'])
			return nativeHeader
				? [
						{
							getHeaderCloseButton: (onPress: () => void) => () =>
								React.createElement('NativeClose', { onPress }),
						},
					]
				: []
		}
		return []
	},
}))
mock.module('@valenced/react', () => ({ React, ReactNative: {} }))
mock.module('@valenced/components', () => ({ Page: () => null }))
mock.module('@valenced/discord/design', () => ({ Design: {} }))
mock.module('@valenced/discord/actions', () => ({
	ActionSheetActionCreators: {},
	AlertActionCreators: {},
}))
mock.module('@valenced/utils/discord', () => ({
	lookupGeneratedIconComponent: () => undefined,
}))
mock.module('../../plugins/better-inbox/src/ui/NotificationCenter', () => ({
	default: () => null,
}))
const { renderNotificationContent } = await import(
	'../../plugins/better-inbox/src/lib/markup'
)
const { openNotificationCenter } = await import(
	'../../plugins/better-inbox/src/ui/openInbox'
)

test('passes complete markdown, mentions and emoji tags to Discord with their original channel context', () => {
	const item: NotificationItem = {
		id: 'one',
		category: 'mentions',
		title: 'Mention',
		content: '<@123> **bold** <@&456> <#789> <:emoji:321>',
		channelId: 'channel',
		guildId: 'guild',
		messageId: 'message',
		guildName: '',
		channelName: '',
		timestamp: '',
	}
	expect(renderNotificationContent(item)).toBe(parsed)
	expect(parse).toHaveBeenCalledWith(item.content, true, {
		channelId: 'channel',
		guildId: 'guild',
		messageId: 'message',
		allowLinks: true,
	})
})

test('native and fallback header close buttons pop the inbox page', () => {
	const errors: unknown[] = []
	for (const available of [true, false]) {
		nativeHeader = available
		openNotificationCenter({
			reportError: error => errors.push(error),
		} as InboxController)
		const tree = route?.()
		if (
			!React.isValidElement<{
				children: ReactElement<{
					screens: {
						BetterInbox: { headerLeft(): ReactElement<{ onPress(): void }> }
					}
				}>
			}>(tree)
		)
			throw new Error('Missing navigator')
		const close = tree.props.children.props.screens.BetterInbox.headerLeft()
		close.props.onPress()
	}
	expect(pops).toBe(2)
	expect(errors).toEqual([])
})
