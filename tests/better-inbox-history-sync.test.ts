import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('BetterInbox fills a newly opened inbox from native stores and fetched history', () => {
	const result = Bun.spawnSync([
		process.execPath,
		'test',
		fileURLToPath(
			new URL('./fixtures/better-inbox-history-sync.cases.ts', import.meta.url),
		),
	])
	if (result.exitCode !== 0)
		throw new Error(new TextDecoder().decode(result.stderr))
	expect(result.exitCode).toBe(0)
})
