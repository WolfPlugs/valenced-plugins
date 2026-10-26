import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import UPNG from '@pdf-lib/upng'

const cleanup = [],
	events = [],
	toasts = [],
	errors = [],
	removed = []
let writes = 0,
	selected = '123',
	waitForWrite
const commands = { getBuiltInCommands: () => [{ id: '-1', name: 'shrug' }] }
const pixels = new Uint8Array(32 * 32 * 4).fill(255)
const png = UPNG.encode([pixels.buffer], 32, 32, 0)
const sandbox = {
	AbortController,
	Uint8Array,
	Uint32Array,
	ArrayBuffer,
	DataView,
	setTimeout,
	clearTimeout,
	atob,
	btoa,
	fetch: async url => {
		assert.match(
			url,
			/^https:\/\/cdn\.discordapp\.com\/avatars\/456\/abc\.png\?size=128$/,
		)
		return { ok: true, headers: new Headers(), arrayBuffer: async () => png }
	},
	plugin: value => value,
	valenced: {
		modules: {
			finders: {
				filters: { withProps: (...props) => props },
				getModules: (_filter, callback) => {
					callback(commands)
					return () => {}
				},
				lookupModule: filter => [
					filter === 'UserStore'
						? { getUser: () => ({ avatar: 'abc' }) }
						: { getChannelId: () => selected },
				],
			},
		},
		patcher: {
			instead: (obj, key, hook) => {
				const original = obj[key]
				obj[key] = (...args) => hook(args, original)
				return () => {
					obj[key] = original
				}
			},
		},
		discord: {
			flux: { withStoreName: name => name },
			common: {
				flux: { Dispatcher: { dispatch: event => events.push(event) } },
			},
			native: {
				FileModule: {
					writeFile: async (_directory, path, data) => {
						writes++
						const bytes = Buffer.from(data, 'base64')
						assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a')
						await waitForWrite?.()
						return `/cache/${path}`
					},
					removeFile: async (...args) => removed.push(args),
				},
			},
			actions: {
				ToastActionCreators: { open: (...args) => toasts.push(args) },
			},
		},
	},
}
const bundle = vm.runInNewContext(
	readFileSync('plugins/petpet/build/js/index.js', 'utf8'),
	sandbox,
)
bundle.default.start({
	cleanup: cb => cleanup.push(cb),
	plugin: { reportError: e => errors.push(e) },
})
const chat = commands.getBuiltInCommands(1)
const command = chat.find(c => c.name === 'petpet')
assert.equal(command.options[0].type, 6)
assert.equal(command.options[0].required, true)
assert.equal(commands.getBuiltInCommands(2).length, 1)
assert.equal(commands.getBuiltInCommands([1, 2]).length, 2)
await command.execute([{ name: 'user', value: '456' }], {
	channel: { id: '123' },
})
assert.equal(events.length, 1)
assert.equal(events[0].type, 'UPLOAD_ATTACHMENT_ADD_FILES')
assert.equal(events[0].channelId, '123')
assert.equal(events[0].files[0].filename, 'petpet.gif')
assert.equal(errors.length, 0)
selected = '999'
await command.execute([{ name: 'user', value: '456' }], {
	channel: { id: '123' },
})
assert.equal(events.length, 1)
assert.equal(writes, 1)
assert.match(errors.at(-1).message, /Channel changed/)
selected = '123'
waitForWrite = () => {
	selected = '999'
}
await command.execute([{ name: 'user', value: '456' }], {
	channel: { id: '123' },
})
assert.equal(events.length, 1)
assert.equal(removed.length, 1)
await command.execute([{ name: 'user', value: undefined }], {
	channel: { id: '123' },
})
assert.match(errors.at(-1).message, /Select a user/)
for (const dispose of cleanup.reverse()) dispose()
assert.equal(commands.getBuiltInCommands(1).length, 1)
console.log(
	'Compiled plugin checks passed: slash user option, command filtering, local GIF upload, channel race cleanup, invalid user and unload.',
)
