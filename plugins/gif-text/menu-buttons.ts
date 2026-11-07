import { Children, cloneElement, isValidElement } from 'react'
import { defaultSettings } from './config'
import type { ReactNode } from 'react'
import type { Settings } from './config'

type ButtonProps = {
	children?: ReactNode
	variant?: string
	grow?: boolean
	text?: string
	onPress?: () => void
}

// Discord's GIF sheet has a favorite button followed by a secondary copy button.
export function withGifActions(
	node: ReactNode,
	settings: Partial<Settings> | undefined,
	onSelect: (attach: boolean) => void,
): ReactNode {
	if (!isValidElement<ButtonProps>(node)) return node
	const children = Children.toArray(node.props.children)
	const [favorite, copy] = children
	if (
		children.length === 2 &&
		isValidElement<ButtonProps>(favorite) &&
		['primary', 'destructive'].includes(favorite.props.variant ?? '') &&
		isValidElement<ButtonProps>(copy) &&
		copy.props.variant === 'secondary' &&
		copy.props.grow === true &&
		typeof copy.props.onPress === 'function' &&
		typeof copy.props.text === 'string'
	) {
		const config = { ...defaultSettings, ...settings }
		const actions: ReactNode[] = []
		if (config.showSendToChat)
			actions.push(
				cloneElement(copy, {
					key: 'gif-text-send-link',
					text: 'Send to chat',
					onPress: () => onSelect(false),
				}),
			)
		if (config.showAttachFile)
			actions.push(
				cloneElement(copy, {
					key: 'gif-text-attach-file',
					text: 'Attach as file',
					onPress: () => onSelect(true),
				}),
			)
		return cloneElement(
			node,
			{},
			favorite,
			config.hideCopyLink ? null : copy,
			...actions,
		)
	}
	if (!children.length) return node
	const updated = children.map(child =>
		withGifActions(child, settings, onSelect),
	)
	if (updated.every((child, index) => child === children[index])) return node
	return cloneElement(node, {}, ...updated)
}
