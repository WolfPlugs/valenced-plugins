import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

for (const name of [
	'KOTLIN_HOME',
	'ANDROID_JAR',
	'VALENCED_API_JAR',
	'D8',
	'COROUTINES_JAR',
]) {
	if (!process.env[name])
		throw new Error(
			`Set ${name} before building native ${process.argv[2] ?? 'media-utils'}`,
		)
}
const pluginName = process.argv[2] ?? 'media-utils'
const output = `plugins/${pluginName}/build/native`
mkdirSync(output, { recursive: true })
function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit' })
	if (result.error) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
}
const kotlin = process.env.KOTLIN_HOME
run(join(kotlin, 'bin/kotlinc'), [
	`plugins/${pluginName}/src/main/kotlin`,
	'-classpath',
	[
		process.env.ANDROID_JAR,
		process.env.VALENCED_API_JAR,
		process.env.COROUTINES_JAR,
	].join(':'),
	'-jvm-target',
	'17',
	'-d',
	`${output}/classes.jar`,
])
run(process.env.D8, [
	'--min-api',
	'24',
	'--lib',
	process.env.ANDROID_JAR,
	'--classpath',
	process.env.VALENCED_API_JAR,
	'--classpath',
	process.env.COROUTINES_JAR,
	'--classpath',
	join(kotlin, 'lib/kotlin-stdlib.jar'),
	'--output',
	`${output}/plugin.jar`,
	`${output}/classes.jar`,
])
