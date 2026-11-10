import { React } from '@valenced/react'
import type { ReactNode } from 'react'

type ButtonProps = {
	children?: ReactNode
	onPress?: () => void
	accessibilityLabel?: string
}

// Only called on YouBarNotificationsButton's rendered tree. Preserve wrappers
// and unrelated buttons supplied by other You bar plugins.
export function replaceNotificationButton(
	tree: ReactNode,
	open: () => void,
): ReactNode {
	let replaced = false
	function visit(node: ReactNode): ReactNode {
		if (Array.isArray(node)) return node.map(visit)
		if (!React.isValidElement<ButtonProps>(node) || replaced) return node
		const key = String(node.key ?? '')
		if (key.startsWith('youbar-') && key !== 'youbar-notifications-button')
			return node
		const label = node.props.accessibilityLabel
		// This is already scoped to the native notification button. Its localized
		// label may contain only an unread count, so do not require English text.
		if (label && /^(Direct Messages|User Settings|Favorites)$/.test(label))
			return node
		if (typeof node.props.onPress === 'function') {
			replaced = true
			return React.cloneElement(node, {
				onPress: open,
				accessibilityLabel: 'BetterInbox',
			})
		}
		if (node.props.children === undefined) return node
		return React.cloneElement(node, { children: visit(node.props.children) })
	}
	return visit(tree)
}
