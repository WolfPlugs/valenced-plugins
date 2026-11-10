import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('Server Info resolves initialized and lazy profile modules', () => {
	// Finder mocks must not replace the mocks used by other plugins in this process.
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL('./fixtures/server-info-profile.cases.ts', import.meta.url),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
