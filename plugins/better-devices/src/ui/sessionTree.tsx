import { React } from '@valenced/react'
import { parseSessions } from '../lib/sessions'
import { DeviceControls } from './DevicesView'
import { SessionCard } from './SessionCard'
import type { ReactElement, ReactNode } from 'react'

function componentName(type: unknown): string | undefined {
	if (typeof type === 'function') return type.name
	if (typeof type !== 'object' || type === null) return
	if ('displayName' in type && typeof type.displayName === 'string')
		return type.displayName
	if ('render' in type && typeof type.render === 'function')
		return type.render.name
	if ('type' in type && typeof type.type === 'function') return type.type.name
}

export function transformSessionTree(
	tree: ReactNode,
	setCurrentHash: (hash: string) => void,
) {
	let cards = 0
	let controlsInserted = false
	function walk(node: ReactNode): {
		node: ReactNode
		containsSession: boolean
	} {
		if (Array.isArray(node)) {
			const children = node.map(walk)
			return {
				node: children.map(child => child.node),
				containsSession: children.some(child => child.containsSession),
			}
		}
		if (!React.isValidElement<Record<string, unknown>>(node))
			return { node, containsSession: false }
		const name = componentName(node.type)
		if (name === 'SessionInfo') {
			const session = parseSessions([node.props.session])[0]
			if (!session) return { node, containsSession: false }
			const current = node.props.current === true || session.current === true
			if (current) setCurrentHash(session.id_hash)
			cards++
			return {
				node: (
					<SessionCard
						key={node.key ?? session.id_hash}
						session={session}
						current={current}
					>
						{node}
					</SessionCard>
				),
				containsSession: true,
			}
		}
		// Native render output has React children. Validate elements before reading their props.
		const element: ReactElement<{ children?: ReactNode }> = node
		const children = walk(element.props.children)
		if (name === 'Stack' && children.containsSession && !controlsInserted) {
			controlsInserted = true
			return {
				node: React.cloneElement(
					element,
					{},
					<DeviceControls key="better-devices-controls" />,
					children.node,
				),
				containsSession: true,
			}
		}
		return {
			node: React.cloneElement(element, {}, children.node),
			containsSession: children.containsSession,
		}
	}
	const result = walk(tree)
	return { tree: result.node, cards, controlsInserted }
}
