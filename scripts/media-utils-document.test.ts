import { expect, test } from 'bun:test'
import { Script } from 'node:vm'
import document from '../plugins/media-utils/editor/canvas-document.generated'
import { canvasDocument } from '../plugins/media-utils/editor/canvas-runtime'

test('ships precompiled canvas code without requiring Hermes function source', () => {
	expect(document).toBe(canvasDocument())
	expect(document).not.toContain('[bytecode]')
	const script = document.match(/<script>([\s\S]*)<\/script>/)?.[1]
	expect(typeof script).toBe('string')
	if (!script) throw Error('Missing editor script')
	expect(() => new Script(script)).not.toThrow()
})
