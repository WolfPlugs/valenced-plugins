import { spawnSync } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { zipSync } from 'fflate'

mkdirSync('build/dist', { recursive: true })
for (const entry of readdirSync('plugins', { withFileTypes: true })) {
	const directory = `plugins/${entry.name}`
	if (!entry.isDirectory() || !existsSync(`${directory}/manifest.json`))
		continue
	const manifestBytes = readFileSync(`${directory}/manifest.json`)
	const manifest = JSON.parse(manifestBytes.toString())
	const files = { 'manifest.json': manifestBytes }
	if (manifest.dist.script) {
		files[manifest.dist.script] = readFileSync(
			`${directory}/build/js/${manifest.dist.script}`,
		)
	}
	if (manifest.dist.android) {
		if (
			!['wolfie.nsfw-blur', 'wolfie.media-utils', 'wolfie.questify'].includes(
				manifest.id,
			)
		)
			throw new Error(`No native builder for ${manifest.id}`)
		const result = spawnSync(
			process.execPath,
			[
				manifest.id !== 'wolfie.nsfw-blur'
					? 'scripts/build-media-utils-native.mjs'
					: 'scripts/build-nsfw-native.mjs',
				entry.name,
			],
			{ stdio: 'inherit' },
		)
		if (result.error) throw result.error
		if (result.status !== 0) process.exit(result.status ?? 1)
		files[manifest.dist.android.path] = readFileSync(
			`${directory}/build/native/${manifest.dist.android.path}`,
		)
	}
	const output = `build/dist/${manifest.id}@${manifest.version}.zip`
	writeFileSync(output, zipSync(files))
	console.log(`Packaged ${output}`)
}
