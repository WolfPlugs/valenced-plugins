import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('clearing notifications requires explicit confirmation and cancel preserves the feed', () => {
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL(
				'./fixtures/better-inbox-confirmation.cases.tsx',
				import.meta.url,
			),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
