import { describe, expect, mock, test } from 'bun:test'
import * as React from 'react'
import type { ReactNode } from 'react'

mock.module('@valenced/react', () => ({ React }))
const { replaceNotificationButton } = await import(
	'../plugins/better-inbox/src/ui/notificationTree'
)
function Container(_props: {
	children?: ReactNode
	onPress?: () => void
	accessibilityLabel?: string
}) {
	return null
}
function Button(_props: { onPress: () => void; accessibilityLabel?: string }) {
	return null
}
function collect(tree: ReactNode): React.ReactElement<{
	children?: ReactNode
	onPress?: () => void
	accessibilityLabel?: string
}>[] {
	if (Array.isArray(tree)) return tree.flatMap(collect)
	if (
		!React.isValidElement<{
			children?: ReactNode
			onPress?: () => void
			accessibilityLabel?: string
		}>(tree)
	)
		return []
	return [tree, ...collect(tree.props.children)]
}

describe('BetterInbox notification button', () => {
	test('changes only the notification press action and preserves wrappers and custom buttons', () => {
		const native = () => {}
		const open = () => {}
		const settings = (
			<Button
				key="youbar-settings-button"
				accessibilityLabel="User Settings"
				onPress={native}
			/>
		)
		const tree = (
			<Container>
				{settings}
				<Container>
					<Button accessibilityLabel="Notifications" onPress={native} />
				</Container>
			</Container>
		)
		const nodes = collect(replaceNotificationButton(tree, open))
		expect(nodes[1]).toBe(settings)
		expect(nodes.filter(node => node.props.onPress === open)).toHaveLength(1)
		expect(nodes.at(-1)?.props.accessibilityLabel).toBe('BetterInbox')
		expect(collect(tree).at(-1)?.props.onPress).toBe(native)
	})
	test('handles a root button without changing its element type', () => {
		const open = () => {}
		const tree = <Button onPress={() => {}} />
		const result = collect(replaceNotificationButton(tree, open))[0]
		expect(result?.type).toBe(Button)
		expect(result?.props.onPress).toBe(open)
	})
	test('preserves unrelated labeled controls and safely accepts an empty render', () => {
		const tree = <Button accessibilityLabel="Favorites" onPress={() => {}} />
		expect(replaceNotificationButton(tree, () => {})).toBe(tree)
		expect(replaceNotificationButton(null, () => {})).toBeNull()
	})
	test('changes only one target, including when sibling output is an array', () => {
		const native = () => {}
		const open = () => {}
		const nodes = collect(
			replaceNotificationButton(
				[
					<Button key="one" onPress={native} />,
					<Button key="two" onPress={native} />,
				],
				open,
			),
		)
		expect(nodes[0]?.props.onPress).toBe(open)
		expect(nodes[1]?.props.onPress).toBe(native)
	})
	test('accepts localized and count-only bell labels inside the scoped notification component', () => {
		const open = () => {}
		for (const label of ['99 sin leer', '99 unread', '通知']) {
			const result = collect(
				replaceNotificationButton(
					<Button accessibilityLabel={label} onPress={() => {}} />,
					open,
				),
			)[0]
			expect(result?.props.onPress).toBe(open)
		}
	})
})
