import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('BetterInbox resolves initialized and lazy profile modules', () => {
	// Finder mocks must not replace the mocks used by other plugins in this process.
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL('./fixtures/better-inbox-profile.cases.ts', import.meta.url),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
