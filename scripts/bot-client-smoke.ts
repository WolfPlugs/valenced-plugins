import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const cleanups = []
const paths = []
const events = []
const moduleCallbacks = new Map()
const eventCallbacks = new Map()
let ready = false
const settingsItems = new Map()
const settingsRows = ['Valenced', 'Plugins', 'Developer']
const navigated = []
const switched = []
const prompts = []
const memberRequests = []
const sentMessages = []
let queuedFiles = []
let selectedChannelId = '123'
let currentIdentity = { id: 'normal', username: 'Normal User', bot: false }
let accountData = { accounts: [] }
const storage = {
	use: () => accountData,
	get: async () => accountData,
	set: async value => {
		accountData = { ...accountData, ...value }
	},
}
let hookIndex = 0
const screenHookState = []
const sheetHookState = []
let hookState = screenHookState
let activeSheet:
	| {
			component: (
				props: unknown,
			) => ReturnType<typeof react.React.createElement>
			key: string
			props: unknown
	  }
	| undefined
const react = {
	React: {
		Fragment: Symbol('Fragment'),
		createElement: (type, props, ...children) => ({ type, props, children }),
		useState(initial) {
			const index = hookIndex++
			if (!(index in hookState)) hookState[index] = initial
			return [
				hookState[index],
				value => {
					hookState[index] =
						typeof value === 'function' ? value(hookState[index]) : value
				},
			]
		},
		useEffect: callback => callback(),
		useRef: initial => ({ current: initial }),
	},
	ReactNative: {
		ScrollView: 'ScrollView',
		View: 'View',
		Text: 'Text',
		Image: 'Image',
		Modal: 'Modal',
		Pressable: 'Pressable',
		TextInput: 'TextInput',
		Alert: { alert: (...args) => prompts.push(args) },
		AppRegistry: {
			setComponentProviderInstrumentationHook() {
				throw new Error('Startup login hook must not be installed')
			},
		},
	},
}
const valenced = {
	utils: { discord: { lookupGeneratedIconComponent: name => name } },
	assets: { getAssetIdByName: () => 1 },
	get react() {
		assert(ready, 'React accessed before start')
		return react
	},
	patcher: {
		after(target, key, callback) {
			const original = target[key]
			target[key] = function (...args) {
				const result = original.apply(this, args)
				return callback(result) ?? result
			}
			return () => {
				target[key] = original
			}
		},
		instead(target, key, callback) {
			const original = target[key]
			target[key] = function (...args) {
				return callback(args, original.bind(this))
			}
			return () => {
				target[key] = original
			}
		},
		before(target, key, callback) {
			const original = target[key]
			target[key] = function (...args) {
				return original.apply(this, callback(args) ?? args)
			}
			return () => {
				target[key] = original
			}
		},
	},
	components: { Page: 'Page' },
	externals: {
		Gorhom: { BottomSheet: { BottomSheetScrollView: 'BottomSheetScrollView' } },
		ReactNavigation: {
			ReactNavigationNative: {
				useNavigation: () => ({ navigate: route => navigated.push(route) }),
			},
		},
	},
	discord: {
		common: {
			flux: {
				Dispatcher: {
					dispatch(action) {
						if (action.type === 'UPLOAD_ATTACHMENT_SET_UPLOADS')
							queuedFiles = action.uploads
					},
				},
			},
		},
		actions: {
			AlertActionCreators: {
				openAlert(_key, element) {
					prompts.push(element)
				},
				dismissAlert() {},
			},
			ActionSheetActionCreators: {
				async openLazy(module, key, props) {
					const loaded = await module
					sheetHookState.length = 0
					activeSheet = { component: loaded.default, key, props }
				},
				hideActionSheet() {
					activeSheet = undefined
				},
			},
		},
		design: {
			Design: {
				TableRow: 'TableRow',
				TableRowGroup: 'TableRowGroup',
				Text: 'Text',
				Button: 'Button',
				ActionSheet: 'ActionSheet',
				BottomSheetTitleHeader: 'BottomSheetTitleHeader',
				TextInput: 'NativeTextInput',
				TextArea: 'NativeTextArea',
				TableSwitchRow: 'TableSwitchRow',
				AlertModal: 'AlertModal',
				AlertActionButton: 'AlertActionButton',
			},
		},
		modules: {
			settings: {
				onSettingsModulesLoaded(callback) {
					callback()
					return () => {}
				},
				registerSettingsItem(key, item) {
					settingsItems.set(key, item)
					return () => settingsItems.delete(key)
				},
				addSettingsItemToSection(section, key) {
					assert.equal(section, 'REVENGE')
					settingsRows.push(key)
					return () => {
						settingsRows.splice(settingsRows.indexOf(key), 1)
					}
				},
				refreshSettings() {},
			},
		},
		flux: {
			getStore(name, callback) {
				if (name === 'SelectedChannelStore')
					callback({ getChannelId: () => selectedChannelId })
				else if (name === 'UploadAttachmentStore')
					callback({ getUploads: () => queuedFiles })
				else throw new Error(`Unexpected store ${name}`)
				return () => {}
			},
			onFluxEventDispatched(event, callback) {
				events.push(event)
				eventCallbacks.set(event, callback)
				return () => {}
			},
		},
		utils: {
			modules: {
				finders: {
					getModuleWithImportedPath(path, callback) {
						paths.push(path)
						moduleCallbacks.set(path, callback)
						return () => {}
					},
				},
			},
		},
	},
}
const { default: options } = runInNewContext(
	readFileSync('plugins/bot-client/build/js/index.js', 'utf8'),
	{
		valenced,
		plugin: options => options,
		clearTimeout,
		setTimeout,
		AbortController,
		fetch: async (url, options) => {
			let body: unknown
			if (url.endsWith('/auth/login')) {
				body = { token: 'user-token' }
			} else if (url.includes('/members?')) {
				memberRequests.push(url)
				body = Array.from({ length: 100 }, (_, i) => ({
					user: { id: String(i + 1), username: `Member ${i}` },
					roles: [],
				}))
			} else if (url.includes('/channels/') && url.endsWith('/messages')) {
				sentMessages.push(JSON.parse(options.body))
				body = { id: '999' }
			} else
				body = url.includes('/guilds')
					? []
					: { id: '789', username: 'Token User', avatar: 'avatarhash' }
			return new Response(JSON.stringify(body), {
				headers: { 'Content-Type': 'application/json' },
			})
		},
	},
)
const api = {
	cleanup: (...callbacks) => cleanups.push(...callbacks),
	logger: { log() {} },
	jsonStorage: storage,
	plugin: {
		reportError(error) {
			throw error
		},
	},
}
options.preInit(api)
assert(paths.includes('modules/gateway/GatewaySocketSingleton.tsx'))
assert(events.includes('CONNECTION_OPEN'))
let token = 'Bot test-token'
moduleCallbacks.get('stores/AuthenticationStore.tsx')({
	default: { getToken: () => token },
})
moduleCallbacks.get('stores/UserStore.tsx')({
	default: { getCurrentUser: () => currentIdentity },
})
moduleCallbacks.get('actions/AuthenticationActionCreators.tsx')({
	default: {
		switchAccountToken: async value => {
			switched.push(value)
			token = value
		},
	},
})
const memberProps = { listId: 'private:123', groups: [] }
const memberStore = { getProps: () => memberProps }
moduleCallbacks.get('stores/ChannelMemberStore.tsx')({ default: memberStore })
assert.equal(memberStore.getProps(null, '123'), memberProps)
assert.equal(memberStore.getProps(undefined, '123'), memberProps)
assert.equal(memberStore.getProps('456', '123'), memberProps)
const HTTP = { post: (options, extra) => ({ options, extra }) }
moduleCallbacks.get('../discord_common/js/packages/http-utils/HTTPUtils.tsx')({
	HTTP,
})
const dm = { url: '/users/@me/channels', body: { recipients: ['123'] } }
assert.equal(HTTP.post(dm, 'extra').options.body.recipient_id, '123')
assert.equal(HTTP.post(dm, 'extra').extra, 'extra')
assert.equal(HTTP.post(dm).options.body.recipients, undefined)
const human = { id: '123', bot: false, nsfw_allowed: false }
const bot = { id: '456', bot: true }
assert.equal(
	eventCallbacks.get('CONNECTION_OPEN')({ user: bot }).user.nsfw_allowed,
	true,
)
assert.equal(bot.nsfw_allowed, undefined)
token = 'human-token'
assert.equal(HTTP.post(dm).options, dm)
assert.equal(eventCallbacks.get('CONNECTION_OPEN')({ user: human }).user, human)
token = 'Bot test-token'
const socket = {
	send: (op, data, ...rest) => ({ op, data, rest }),
	_handleDispatch: (data, event) => ({ data, event }),
}
moduleCallbacks.get('modules/gateway/GatewaySocketSingleton.tsx')({ socket })
assert.equal(
	socket._handleDispatch({ user: bot }, 'READY').data.user.nsfw_allowed,
	true,
)
assert.equal(socket._handleDispatch(bot, 'USER_UPDATE').data.nsfw_allowed, true)
assert.equal(socket._handleDispatch(human, 'USER_UPDATE').data, human)
const voice = {
	guild_id: '123',
	channel_id: '456',
	self_mute: false,
	self_deaf: false,
	self_video: true,
}
assert.equal(socket.send(4, voice).data.self_video, undefined)
assert.equal(socket.send(4, voice).data.channel_id, '456')
assert.equal(
	socket.send(4, { ...voice, channel_id: null }).data.channel_id,
	null,
)
assert.equal(
	socket.send(4, { guild_id: null, channel_id: null }).data.guild_id,
	'123',
)
assert.equal(socket.send(4, { channel_id: null }).data.channel_id, null)
const oldIdentity = currentIdentity
currentIdentity = { id: 'voice-bot', username: 'Bot', bot: true }
socket._handleDispatch(
	{ user_id: 'someone-else', guild_id: '999', channel_id: '888' },
	'VOICE_STATE_UPDATE',
)
assert.equal(
	socket.send(4, { guild_id: null, channel_id: null }).data.guild_id,
	'123',
)
socket._handleDispatch(
	{ user_id: 'voice-bot', guild_id: '456', channel_id: '789' },
	'VOICE_STATE_UPDATE',
)
assert.equal(
	socket.send(4, { guild_id: null, channel_id: null }).data.guild_id,
	'456',
)
socket._handleDispatch(
	{ user_id: 'voice-bot', guild_id: '456', channel_id: null },
	'VOICE_STATE_UPDATE',
)
assert.equal(socket.send(4, { guild_id: null, channel_id: null }), undefined)
socket.send(4, voice)
token = 'Bot different-token'
assert.equal(socket.send(4, { guild_id: null, channel_id: null }), undefined)
token = 'Bot test-token'
currentIdentity = oldIdentity

assert.equal(socket.send(4, { ...voice, guild_id: null }), undefined)
const voiceState = {
	guild_id: '123',
	user_id: '456',
	session_id: 'voice-session',
}
const voiceServer = {
	guild_id: '123',
	endpoint: 'example.discord.media',
	token: 'voice-token',
}
assert.equal(
	socket._handleDispatch(voiceState, 'VOICE_STATE_UPDATE').data,
	voiceState,
)
assert.equal(
	socket._handleDispatch(voiceServer, 'VOICE_SERVER_UPDATE').data,
	voiceServer,
)
token = 'human-token'
assert.equal(socket.send(4, voice).data, voice)
token = 'Bot test-token'

ready = true
await options.start(api)
assert.equal(settingsRows.at(-1), 'WolfieBotClient')
const item = settingsItems.get('WolfieBotClient')
assert.equal(item.IconComponent, 'RobotIcon')
assert.equal(item.useTitle(), 'Bot Client')
const page = item.screen.getComponent()()
const Screen = page.type
function findElement(tree, predicate) {
	if (!tree || typeof tree !== 'object') return undefined
	if (predicate(tree)) return tree
	for (const child of [
		...(tree.children ?? []).flat(Infinity),
		...[
			tree.props?.children ?? [],
			tree.props?.label,
			tree.props?.trailing,
			tree.props?.icon,
		].flat(Infinity),
	]) {
		const found = findElement(child, predicate)
		if (found) return found
	}
}
function findRow(tree, label) {
	return findElement(
		tree,
		node =>
			node.type === 'TableRow' &&
			(node.props.label === label ||
				findElement(
					node.props.label,
					child => child.type === 'Text' && child.children.includes(label),
				)),
	)
}
function findButton(tree, label) {
	return findElement(
		tree,
		node =>
			(node.type === 'Pressable' || node.type === 'Button') &&
			node.props.accessibilityLabel === label,
	)
}
function renderScreen() {
	hookState = screenHookState
	hookIndex = 0
	return Screen(page.props)
}
const flush = () => new Promise(resolve => setImmediate(resolve))
token = 'normal-token'
let tree = renderScreen()
assert(!JSON.stringify(tree).includes('normal-token'))
findRow(tree, 'Save current account').props.onPress()
await flush()
assert.equal(accountData.accounts[0].id, 'normal')
assert.equal(accountData.accounts[0].token, 'normal-token')
accountData.accounts.push({
	id: 'bot',
	username: 'Test Bot',
	bot: false,
	token: 'Bot saved-token',
})
tree = renderScreen()
assert.equal(findRow(tree, 'Test Bot').props.icon.type, 'Image')
assert(
	findElement(
		findRow(tree, 'Test Bot').props.label,
		node => node.type === 'Text' && node.children.includes('APP'),
	),
)
assert(
	!findElement(
		findRow(tree, 'Normal User').props.label,
		node => node.type === 'Text' && node.children.includes('APP'),
	),
)
findRow(tree, 'Test Bot').props.onPress()
await flush()
assert.equal(switched.at(-1), 'Bot saved-token')
assert.equal(accountData.accounts.length, 2)
currentIdentity = { id: 'bot', username: 'Test Bot', bot: false }
tree = renderScreen()
findRow(tree, 'Normal User').props.onPress()
await flush()
assert.equal(switched.at(-1), 'normal-token')
assert.equal(
	accountData.accounts.find(account => account.id === 'bot').bot,
	true,
)
currentIdentity = { id: 'normal', username: 'Normal User', bot: false }
tree = renderScreen()
findRow(tree, 'Add a Discord account').props.onPress()
await flush()
function renderSheet() {
	hookIndex = 0
	hookState = sheetHookState
	return activeSheet.component(activeSheet.props)
}
let sheet = renderSheet()
assert.equal(sheet.type, 'ActionSheet')
assert.equal(sheet.props.scrollable, true)
assert.equal(sheet.props.handleDisabled, false)
assert(!findElement(tree, node => node.type === 'Modal'))
findRow(sheet, 'Email and password').props.onPress()
await flush()
sheet = renderSheet()
assert(
	findElement(
		sheet,
		node =>
			node.type === 'NativeTextInput' && node.props.label === 'Email or phone',
	),
)
assert(
	findElement(
		sheet,
		node => node.type === 'NativeTextInput' && node.props.label === 'Password',
	).props.secureTextEntry,
)
assert.equal(navigated.length, 0)
assert.equal(switched.length, 2)
findElement(
	sheet,
	node =>
		node.type === 'NativeTextInput' && node.props.label === 'Email or phone',
).props.onChange('user@example.com')
findElement(
	sheet,
	node => node.type === 'NativeTextInput' && node.props.label === 'Password',
).props.onChange('test-password')
sheet = renderSheet()
findRow(sheet, 'Sign in and save account').props.onPress()
await flush()
assert.equal(activeSheet, undefined)
assert(
	accountData.accounts.some(
		account => account.id === '789' && account.token === 'user-token',
	),
)
assert(!JSON.stringify(accountData).includes('test-password'))
tree = renderScreen()
findRow(tree, 'Add a Discord account').props.onPress()
await flush()
sheet = renderSheet()
findElement(
	sheet,
	node =>
		node.type === 'NativeTextInput' && node.props.label === 'Account token',
).props.onChange('user-token')
sheet = renderSheet()
findRow(sheet, 'Save account').props.onPress()
await flush()
assert.equal(
	accountData.accounts.find(account => account.id === '789').avatar,
	'avatarhash',
)
assert.equal(activeSheet, undefined)
tree = renderScreen()
findButton(tree, 'Remove Normal User').props.onPress({ stopPropagation() {} })
const confirmation = prompts
	.at(-1)
	.props.actions.find(button => button.props.text === 'Remove')
confirmation.props.onPress()
await flush()
assert.equal(accountData.accounts.length, 2)
assert.equal(switched.length, 2)
token = 'Bot test-token'
currentIdentity = { id: '789', username: 'Builder Bot', bot: true }
const originalMenu = props => ({ type: 'Toolbar', props })
const menuModule = { default: { type: originalMenu } }
moduleCallbacks.get(
	'modules/chat_input/native/action_buttons/ChatInputActions.tsx',
)(menuModule)
const menuProps = { triggerOnLongPress: true, items: [{ label: 'Files' }] }
assert.equal(
	moduleCallbacks.has(
		'modules/media_keyboard/native/components/MediaKeyboardBottomSheetActions.tsx',
	),
	false,
)
const footerProps = { footer: { type: 'Toolbar', props: menuProps } }
assert.equal(
	menuModule.default.type(footerProps).props.footer.props.items.length,
	2,
)
assert.equal(menuProps.items.length, 1)

token = 'normal-token'
assert.equal(menuModule.default.type(menuProps).props, menuProps)
token = 'Bot test-token'
const tapProps = { items: [{ label: 'Files' }] }
assert.equal(menuModule.default.type(tapProps).props.items.length, 1)
const injectedMenu = menuModule.default.type(menuProps).props
assert.equal(injectedMenu.items.length, 2)
assert.equal(menuProps.items.length, 1)
assert.equal(injectedMenu.items.at(-1).label, 'Embed Builder')
injectedMenu.items.at(-1).action()
await flush()
sheet = renderSheet()
assert.equal(sheet.props.scrollable, true)
assert.equal(sheet.children[0].type, 'BottomSheetScrollView')
assert.equal(sheet.children[0].props.style.flex, 1)
findElement(
	sheet,
	node => node.type === 'NativeTextInput' && node.props.label === 'Title',
).props.onChange('Builder test')
sheet = renderSheet()
findRow(sheet, 'Send message').props.onPress()
await flush()
assert.equal(sentMessages[0].embeds[0].title, 'Builder test')
assert.deepEqual(sentMessages[0].allowed_mentions, { parse: [] })
assert.equal(activeSheet, undefined)
injectedMenu.items.at(-1).action()
await flush()
sheet = renderSheet()
findRow(sheet, 'Mode: Embeds').props.onPress()
sheet = renderSheet()
findRow(sheet, 'Send message').props.onPress()
await flush()
assert.equal(sentMessages[1].flags, 32768)
assert(!('embeds' in sentMessages[1]))
assert.equal(activeSheet, undefined)
queuedFiles = [
	{
		id: 'queued-file',
		filename: 'notes.txt',
		uploadedFilename: 'uploaded/notes.txt',
	},
]
injectedMenu.items.at(-1).action()
await flush()
sheet = renderSheet()
findRow(sheet, 'Mode: Embeds').props.onPress()
sheet = renderSheet()
findRow(sheet, 'File: notes.txt').props.onPress()
sheet = renderSheet()
findRow(sheet, 'Send message').props.onPress()
await flush()
assert.equal(sentMessages[2].attachments[0].filename, 'notes.txt')
assert.equal(sentMessages[2].components.at(-1).type, 13)
assert.equal(queuedFiles.length, 0)
assert.equal(activeSheet, undefined)
injectedMenu.items.at(-1).action()
await flush()
sheet = renderSheet()
findElement(
	sheet,
	node => node.type === 'NativeTextInput' && node.props.label === 'Title',
).props.onChange('Wrong channel')
sheet = renderSheet()
selectedChannelId = '456'
findRow(sheet, 'Send message').props.onPress()
await flush()
assert.equal(sentMessages.length, 3)
assert(activeSheet)
selectedChannelId = '123'
findRow(renderSheet(), 'Close').props.onPress()

moduleCallbacks.get('stores/ChannelStore.tsx')({
	default: { getChannel: () => ({ permissionOverwrites: {} }) },
})
socket._handleDispatch(
	{
		id: '123',
		member_count: 20000,
		roles: [{ id: '123', permissions: '1024' }],
	},
	'GUILD_CREATE',
)
memberStore.getProps('123', '456')
await flush()
assert.equal(memberRequests.length, 1)
assert(memberRequests[0].endsWith('/members?limit=100'))
memberStore.getProps('123', '456')
await flush()
assert.equal(memberRequests.length, 1)
for (const cleanup of cleanups.toReversed()) cleanup()
assert.equal(menuModule.default.type, originalMenu)

assert.deepEqual(settingsRows, ['Valenced', 'Plugins', 'Developer'])
assert.equal(settingsItems.size, 0)
assert.equal(HTTP.post(dm).options, dm)
console.log(
	'Bot Client startup, DM regression, account saving/switching, normal login, and settings cleanup passed',
)
