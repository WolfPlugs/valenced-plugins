import { React } from '@valenced/react'
import type { ReactElement, ReactNode } from 'react'

type Render = (props: Record<string, unknown>) => ReactNode

// Discord exports a container whose child renders the actual device list later.
// Keep the inner renderer as a stable component so its hooks run in its own fiber.
export function createScreenRenderer(decorate: (tree: ReactNode) => ReactNode) {
	const wrappers = new WeakMap<object, Render>()
	return function render(tree: ReactNode): ReactNode {
		if (Array.isArray(tree)) return tree.map(render)
		if (!React.isValidElement<Record<string, unknown>>(tree)) return tree
		if (
			typeof tree.type === 'function' &&
			tree.type.name === 'UserSettingsSessions'
		) {
			const original = tree.type
			let wrapper = wrappers.get(original)
			if (!wrapper) {
				wrapper = function BetterDevicesSessions(props) {
					return decorate(Reflect.apply(original, undefined, [props]))
				}
				wrappers.set(original, wrapper)
			}
			return React.createElement(wrapper, { ...tree.props, key: tree.key })
		}
		const element: ReactElement<{ children?: ReactNode }> = tree
		if (!('children' in element.props)) return tree
		return React.cloneElement(element, {}, render(element.props.children))
	}
}
