import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('BetterInbox supplies message context to native markup and provides a working header close action', () => {
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL(
				'./fixtures/better-inbox-presentation.cases.tsx',
				import.meta.url,
			),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
