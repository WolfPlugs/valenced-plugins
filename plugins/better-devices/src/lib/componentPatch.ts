import { instead } from '@valenced/patcher'
import type { ReactNode } from 'react'

type Render = (...args: unknown[]) => ReactNode
export type ComponentModule = { default: Render | { type: Render } }

export function patchComponent(
	module: ComponentModule,
	transform: (tree: ReactNode) => ReactNode,
): () => void {
	if (typeof module.default === 'function') {
		const target = module as { default: Render }
		return instead(target, 'default', function (args, original) {
			return transform(Reflect.apply(original, this, args))
		})
	}
	const memo = module.default
	if (memo && typeof memo.type === 'function') {
		return instead(memo, 'type', function (args, original) {
			return transform(Reflect.apply(original, this, args))
		})
	}
	throw new Error('Discord component renderer is unavailable')
}
