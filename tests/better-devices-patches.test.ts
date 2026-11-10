import { describe, expect, mock, test } from 'bun:test'

type Render = (this: unknown, ...args: unknown[]) => unknown

// The host has no Valenced patcher. Reproduce only its call/cleanup contract.
mock.module('@valenced/patcher', () => ({
	instead(
		holder: Record<string, Render>,
		key: string,
		patch: (this: unknown, args: unknown[], original: Render) => unknown,
	) {
		const original = holder[key]
		if (!original) throw new Error('Missing patch target')
		holder[key] = function (...args) {
			return patch.call(this, args, original)
		}
		return () => {
			holder[key] = original
		}
	},
}))

const { patchComponent } = await import(
	'../plugins/better-devices/src/lib/componentPatch'
)

describe('Better Devices component patches', () => {
	test('patches a plain export, preserving its receiver and restoring it on cleanup', () => {
		const native = function (this: unknown, ...args: unknown[]) {
			expect(this).toBe(module)
			expect(args).toEqual(['props'])
			return 'native screen'
		}
		const module = { default: native }
		const cleanup = patchComponent(module, tree => `${tree}: decorated`)
		expect(module.default('props')).toBe('native screen: decorated')
		cleanup()
		expect(module.default).toBe(native)
	})

	test('patches the memo renderer used by the You tab, retaining its memo object', () => {
		const native = (...args: unknown[]) =>
			args[0] === 'props' ? 'native bar' : null
		const memo = { type: native }
		const module = { default: memo }
		const cleanup = patchComponent(module, tree => `${tree}: badge`)
		expect(module.default).toBe(memo)
		expect(module.default.type('props')).toBe('native bar: badge')
		cleanup()
		expect(module.default.type).toBe(native)
	})
})
