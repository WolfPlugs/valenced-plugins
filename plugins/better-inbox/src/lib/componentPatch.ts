import { instead } from '@valenced/patcher'
import type { ReactNode } from 'react'

type Render = (...args: unknown[]) => ReactNode
export type Component = Render | { type: Component } | { render: Render }

export function patchComponent(
	module: Record<string, unknown>,
	key: string,
	transform: (tree: ReactNode) => ReactNode,
): () => void {
	const component = module[key]
	if (typeof component === 'function') {
		const target = module as Record<string, Render>
		return instead(target, key, function (args, original) {
			return transform(Reflect.apply(original, this, args))
		})
	}
	if (component && typeof component === 'object') {
		if ('type' in component) return patchComponent(component, 'type', transform)
		if ('render' in component)
			return patchComponent(component, 'render', transform)
	}
	throw new Error(`Discord component ${key} renderer is unavailable`)
}
