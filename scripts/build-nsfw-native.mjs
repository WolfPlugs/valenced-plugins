import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const required = [
	'KOTLIN_HOME',
	'ANDROID_JAR',
	'VALENCED_API_JAR',
	'XPOSED_API_JAR',
	'D8',
	'DEXKIT_JAR',
	'COROUTINES_JAR',
]
for (const name of required) {
	if (!process.env[name])
		throw new Error(`Set ${name} before building native NSFW Blur`)
}
const output = 'plugins/nsfw-blur/build/native'
mkdirSync(output, { recursive: true })
const dependencies = [
	process.env.ANDROID_JAR,
	process.env.VALENCED_API_JAR,
	process.env.XPOSED_API_JAR,
	process.env.DEXKIT_JAR,
	process.env.COROUTINES_JAR,
]
function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit' })
	if (result.error) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
}
run(join(process.env.KOTLIN_HOME, 'bin/kotlinc'), [
	'plugins/nsfw-blur/src/main/kotlin',
	'-classpath',
	dependencies.join(':'),
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
	process.env.XPOSED_API_JAR,
	'--classpath',
	process.env.DEXKIT_JAR,
	'--classpath',
	process.env.COROUTINES_JAR,
	'--classpath',
	join(process.env.KOTLIN_HOME, 'lib/kotlin-stdlib.jar'),
	'--output',
	`${output}/plugin.jar`,
	`${output}/classes.jar`,
])
