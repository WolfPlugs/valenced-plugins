import { expect, test } from 'bun:test'
import { Children, createElement, isValidElement } from 'react'
import { withGifActions } from '../plugins/gif-text/menu-buttons'
import type { ReactNode } from 'react'

function buttons(node: ReactNode): { text?: string; onPress?: () => void }[] {
	if (
		!isValidElement<{
			children?: ReactNode
			text?: string
			onPress?: () => void
		}>(node)
	)
		return []
	if (node.props.text) return [node.props]
	return Children.toArray(node.props.children).flatMap(buttons)
}

const favorite = createElement('button', {
	type: 'button',
	text: 'Remove favorite',
	variant: 'destructive',
})
const copy = createElement('button', {
	type: 'button',
	text: 'Localized copy label',
	variant: 'secondary',
	grow: true,
	onPress() {},
})
const sheet = createElement(
	'section',
	{},
	createElement('div', {}, favorite, copy),
)

test('old settings enable both actions and preserve native controls', () => {
	const selected: boolean[] = []
	const result = buttons(
		withGifActions(sheet, { attachGif: true }, attach => selected.push(attach)),
	)
	expect(result.map(button => button.text)).toEqual([
		'Remove favorite',
		'Localized copy label',
		'Send to chat',
		'Attach as file',
	])
	result[2].onPress?.()
	result[3].onPress?.()
	expect(selected).toEqual([false, true])
})

test('menu switches work independently and keep favorite', () => {
	for (const hideCopyLink of [false, true])
		for (const showSendToChat of [false, true])
			for (const showAttachFile of [false, true]) {
				const result = buttons(
					withGifActions(
						sheet,
						{ hideCopyLink, showSendToChat, showAttachFile },
						() => {},
					),
				)
				expect(result.map(button => button.text)).toEqual([
					'Remove favorite',
					...(!hideCopyLink ? ['Localized copy label'] : []),
					...(showSendToChat ? ['Send to chat'] : []),
					...(showAttachFile ? ['Attach as file'] : []),
				])
			}
})

test('unrecognized menu structures stay untouched', () => {
	const other = createElement('div', {}, copy)
	expect(withGifActions(other, undefined, () => {})).toEqual(other)
})
