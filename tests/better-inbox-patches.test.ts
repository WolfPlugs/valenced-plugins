import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('BetterInbox replaces the native notification feed and restores it on cleanup', () => {
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL('./fixtures/better-inbox-patches.cases.tsx', import.meta.url),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
