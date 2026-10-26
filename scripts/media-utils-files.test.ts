import { expect, mock, test } from 'bun:test'

const reads: string[] = []
mock.module('@valenced/discord/native', () => ({
	FileModule: {
		readFile: async (path: string) => {
			reads.push(`file:${path}`)
			return 'YWJj'
		},
		readAsset: async (uri: string) => {
			reads.push(`asset:${uri}`)
			return 'YWJj'
		},
	},
}))
mock.module('@valenced/modules/native', () => ({
	callNativeMethod: async (name: string, args: unknown[]) => {
		reads.push(`${name}:${args[0]}`)
		return 'YWJj'
	},
}))
const { readEditorMedia } = await import(
	'../plugins/media-utils/editor/media-file'
)
test('reads local files through the file API instead of Android resources', async () => {
	await readEditorMedia('file:///cache/video%20one.mp4')
	await readEditorMedia('/cache/video-two.mp4')
	expect(reads.splice(0)).toEqual([
		'file:/cache/video one.mp4',
		'file:/cache/video-two.mp4',
	])
})
test('reads content URIs through Android without a Discord resolver', async () => {
	await readEditorMedia('content://media/video/123')
	expect(reads.splice(0)).toEqual([
		'wolfie.media-utils.readMedia:content://media/video/123',
	])
})
test('uses asset download only for HTTP sources', async () => {
	await readEditorMedia('https://cdn.discordapp.com/emojis/123.png')
	expect(reads.splice(0)).toEqual([
		'asset:https://cdn.discordapp.com/emojis/123.png',
	])
})
