import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('BetterInbox preserves Flux dispatch, reacts to account changes, and cleans up its runtime', () => {
	// Keep app-runtime mocks out of the other plugins' test processes.
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL('./fixtures/better-inbox-runtime.cases.ts', import.meta.url),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
