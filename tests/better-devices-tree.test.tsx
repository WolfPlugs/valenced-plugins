import { describe, expect, mock, test } from 'bun:test'
import * as React from 'react'
import type { ReactNode } from 'react'

// The app's loader is unavailable on the host; use real React elements to inspect its render tree.
mock.module('@valenced/react', () => ({ React }))
function DeviceControls() {
	return null
}
function SessionCard(_props: { children?: ReactNode }) {
	return null
}
mock.module('../plugins/better-devices/src/ui/DevicesView', () => ({
	DeviceControls,
}))
mock.module('../plugins/better-devices/src/ui/SessionCard', () => ({
	SessionCard,
}))

const { transformSessionTree } = await import(
	'../plugins/better-devices/src/ui/sessionTree'
)
const { createScreenRenderer } = await import(
	'../plugins/better-devices/src/ui/screenRenderer'
)

function Stack({ children }: { children?: ReactNode }) {
	return children
}
function TableRowGroup({ children }: { children?: ReactNode }) {
	return children
}
function SessionInfo(_props: {
	session: { id_hash: string }
	current?: boolean
}) {
	return null
}

function Text({ children }: { children?: ReactNode }) {
	return children
}
function TableRow(_props: { label: string; onPress?: () => void }) {
	return null
}

function collect(
	tree: ReactNode,
): React.ReactElement<Record<string, unknown>>[] {
	if (Array.isArray(tree)) return tree.flatMap(collect)
	if (!React.isValidElement<Record<string, unknown>>(tree)) return []
	const element: React.ReactElement<{ children?: ReactNode }> = tree
	return [tree, ...collect(element.props.children)]
}

describe('Better Devices screen integration', () => {
	test('reaches rows inside the deferred UserSettingsSessions child of the exported container', () => {
		let renders = 0
		let loading = true
		function UserSettingsSessions() {
			renders++
			return loading ? null : (
				<Stack>
					<SessionInfo session={{ id_hash: 'current' }} current />
					<SessionInfo session={{ id_hash: 'other' }} />
				</Stack>
			)
		}
		const render = createScreenRenderer(
			tree => transformSessionTree(tree, () => {}).tree,
		)
		const container = <UserSettingsSessions />
		const first = render(container)
		const second = render(container)
		expect(renders).toBe(0)
		if (!React.isValidElement(first) || !React.isValidElement(second))
			throw new Error('Expected screen component')
		expect(first.type).toBe(second.type)
		expect(first.type).not.toBe(UserSettingsSessions)
		if (typeof first.type !== 'function')
			throw new Error('Expected a render function')
		expect(Reflect.apply(first.type, undefined, [first.props])).toBeNull()
		loading = false
		const nodes = collect(Reflect.apply(first.type, undefined, [first.props]))
		expect(nodes.filter(node => node.type === SessionCard)).toHaveLength(2)
		expect(nodes.filter(node => node.type === DeviceControls)).toHaveLength(1)
	})

	test('wraps session rows while preserving all native children and the native logout action', () => {
		const nativeLogout = () => {}
		const nativeRow = (
			<TableRow
				key="logout-all"
				onPress={nativeLogout}
				label="Log out all known devices"
			/>
		)
		const legacy = <Text key="legacy">Unknown older sessions</Text>
		const tree = (
			<Stack>
				<TableRowGroup>
					<SessionInfo session={{ id_hash: 'current' }} current />
				</TableRowGroup>
				<Text>Native explanation</Text>
				{nativeRow}
				<TableRowGroup>
					<SessionInfo session={{ id_hash: 'other' }} />
				</TableRowGroup>
				{legacy}
			</Stack>
		)
		const current: string[] = []
		const result = transformSessionTree(tree, hash => current.push(hash))
		const nodes = collect(result.tree)
		expect(result.cards).toBe(2)
		expect(result.controlsInserted).toBe(true)
		expect(current).toEqual(['current'])
		expect(nodes.filter(node => node.type === DeviceControls)).toHaveLength(1)
		expect(nodes.filter(node => node.type === SessionInfo)).toHaveLength(2)
		expect(nodes.find(node => node.key === 'logout-all')?.props.onPress).toBe(
			nativeLogout,
		)
		expect(nodes.find(node => node.key === 'legacy')?.props.children).toBe(
			'Unknown older sessions',
		)
	})

	test('supports a memoized Stack without changing its type', () => {
		const MemoStack = React.memo(Stack)
		const result = transformSessionTree(
			<MemoStack>
				<SessionInfo session={{ id_hash: 'device' }} />
			</MemoStack>,
			() => {},
		)
		expect(result.controlsInserted).toBe(true)
		expect(React.isValidElement(result.tree) && result.tree.type).toBe(
			MemoStack,
		)
	})

	test('leaves unrelated screens free of device controls', () => {
		const result = transformSessionTree(
			<Stack>
				<TableRow label="Unrelated settings" />
			</Stack>,
			() => {},
		)
		expect(result.cards).toBe(0)
		expect(result.controlsInserted).toBe(false)
		expect(
			collect(result.tree).some(node => node.type === DeviceControls),
		).toBe(false)
	})
})
