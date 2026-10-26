import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { BottomSheet as Gorhom } from '@valenced/externals/gorhom'
import { createElement as h, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { buildMessage } from './message'
import { isRecord } from './protocol'
import { getCurrentAccount, hasBotToken } from './session'
import { uploadFile, uploadName } from './uploads'
import type { SavedAccount } from './accounts'
import type { PendingUpload } from './uploads'

type Props = {
	pendingUploads: () => PendingUpload[]
	consumeUploads: (ids: string[]) => void
	initialAccount: SavedAccount
	channelId: string
	currentChannel: () => string | undefined
	reportError: (error: unknown) => void
}
const key = 'wolfie.bot-client.embed-builder'
const drafts = new Map<string, { embed: string; components: string }>()
const initialEmbed = JSON.stringify(
	{ embeds: [{ title: '', description: '' }] },
	null,
	2,
)
const initialComponents = JSON.stringify(
	{ components: [{ type: 10, content: 'Your message' }] },
	null,
	2,
)

function Builder({
	channelId,
	currentChannel,
	reportError,
	initialAccount,
	pendingUploads,
	consumeUploads,
}: Props) {
	const [mode, setMode] = useState<'embed' | 'components'>('embed')
	const [includeFiles, setIncludeFiles] = useState(false)
	const files = useRef(pendingUploads()).current
	const [embedRaw, setEmbedRaw] = useState(
		drafts.get(channelId)?.embed ?? initialEmbed,
	)
	const [componentsRaw, setComponentsRaw] = useState(
		drafts.get(channelId)?.components ?? initialComponents,
	)
	const [selected, setSelected] = useState(0)
	const [advanced, setAdvanced] = useState(false)
	const [colorText, setColorText] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState('')
	const sending = useRef(false)
	const request = useRef<AbortController | null>(null)
	const retryAt = useRef(0)
	const nonce = useRef<{ draft: string; value: string } | null>(null)
	const account = useRef(initialAccount)
	useEffect(() => () => request.current?.abort(), [])
	const raw = mode === 'embed' ? embedRaw : componentsRaw
	function setRaw(value: string) {
		if (mode === 'embed') setEmbedRaw(value)
		else setComponentsRaw(value)
		drafts.set(channelId, {
			embed: mode === 'embed' ? value : embedRaw,
			components: mode === 'components' ? value : componentsRaw,
		})
		setMessage('')
	}
	let data: Record<string, unknown> = {}
	try {
		const parsed: unknown = JSON.parse(raw)
		if (isRecord(parsed)) data = parsed
	} catch {}
	const embeds = Array.isArray(data.embeds) ? data.embeds.filter(isRecord) : []
	const selectedIndex = Math.min(selected, Math.max(0, embeds.length - 1))
	const embed = embeds[selectedIndex] ?? {}
	useEffect(() => {
		setColorText(
			typeof embed.color === 'number'
				? embed.color.toString(16).padStart(6, '0')
				: '',
		)
	}, [selectedIndex, mode, embed.color])
	function update(edit: (draft: Record<string, unknown>) => void) {
		try {
			const draft: unknown = JSON.parse(raw)
			if (!isRecord(draft)) throw new Error('Use a JSON object.')
			edit(draft)
			setRaw(JSON.stringify(draft, null, 2))
		} catch {
			setMessage('Fix the JSON before using the form or templates.')
		}
	}
	function editEmbed(edit: (value: Record<string, unknown>) => void) {
		update(draft => {
			const list = Array.isArray(draft.embeds)
				? draft.embeds.filter(isRecord)
				: [{}]
			const value = list[selectedIndex]
			if (!value) throw new Error('Select an embed first.')
			edit(value)
			draft.embeds = list
		})
	}
	function input(
		label: string,
		value: unknown,
		change: (text: string) => void,
		multiline = false,
		limit = 4096,
	) {
		return h(
			View,
			{ key: label, style: { marginBottom: 12 } },
			h(multiline ? Design.TextArea : Design.TextInput, {
				label,
				value: typeof value === 'string' ? value : '',
				onChange: change,
				maxLength: limit,
				editable: !busy,
				secureTextEntry: false,
			}),
		)
	}
	function field(label: string, prop: string, limit = 256, multiline = false) {
		return input(
			label,
			embed[prop],
			value =>
				editEmbed(item => {
					if (value) item[prop] = value
					else delete item[prop]
				}),
			multiline,
			limit,
		)
	}
	function nested(label: string, parent: string, prop: string, limit = 2048) {
		const object = isRecord(embed[parent]) ? embed[parent] : {}
		return input(
			label,
			object[prop],
			value =>
				editEmbed(item => {
					const object = isRecord(item[parent]) ? { ...item[parent] } : {}
					if (value) object[prop] = value
					else delete object[prop]
					if (Object.keys(object).length) item[parent] = object
					else delete item[parent]
				}),
			false,
			limit,
		)
	}
	function row(
		label: string,
		action: () => void,
		disabled = busy,
		subLabel?: string,
	) {
		return h(Design.TableRow, {
			key: label,
			label,
			subLabel,
			disabled,
			onPress: action,
		})
	}
	function addComponent(component: Record<string, unknown>) {
		update(draft => {
			draft.components = [
				...(Array.isArray(draft.components) ? draft.components : []),
				component,
			]
		})
	}
	async function send() {
		if (sending.current) return
		if (
			!advanced &&
			mode === 'embed' &&
			colorText &&
			!/^#?[0-9a-f]{6}$/i.test(colorText)
		) {
			setMessage('Enter a six-digit hex color.')
			return
		}
		let payload: ReturnType<typeof buildMessage>
		try {
			payload = buildMessage(
				raw,
				mode,
				includeFiles ? files.map(uploadName) : [],
			)
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Invalid message.')
			return
		}
		if (
			!hasBotToken() ||
			getCurrentAccount().token !== account.current.token ||
			currentChannel() !== channelId
		) {
			setMessage(
				'Account or channel changed. Reopen the builder in the destination channel.',
			)
			return
		}
		if (Date.now() < retryAt.current) {
			setMessage(
				`Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`,
			)
			return
		}
		sending.current = true
		setBusy(true)
		setMessage('')
		const controller = new AbortController()
		request.current = controller
		const timeout = setTimeout(
			() => controller.abort(),
			includeFiles ? 150000 : 15000,
		)
		const identity = `${mode}:${raw}:${includeFiles ? files.map(file => file.id).join(',') : ''}`
		if (nonce.current?.draft !== identity)
			nonce.current = {
				draft: identity,
				value: String(BigInt(Date.now()) * 4194304n),
			}
		try {
			if (
				includeFiles &&
				files.some(
					file => !pendingUploads().some(queued => queued.id === file.id),
				)
			) {
				setMessage('Queued files changed. Close and reopen the builder.')
				return
			}
			if (includeFiles && files.length > 10) {
				setMessage('A message supports up to 10 attachments.')
				return
			}
			const attachments = includeFiles
				? await Promise.all(
						files.map((file, index) =>
							uploadFile(file, index, controller.signal),
						),
					)
				: []
			if (
				controller.signal.aborted ||
				!hasBotToken() ||
				getCurrentAccount().token !== account.current.token ||
				currentChannel() !== channelId
			) {
				setMessage('Account or channel changed. Reopen the builder.')
				return
			}
			const response = await fetch(
				`https://discord.com/api/v10/channels/${channelId}/messages`,
				{
					method: 'POST',
					headers: {
						Authorization: account.current.token,
						'Content-Type': 'application/json',
					},
					credentials: 'omit',
					signal: controller.signal,
					body: JSON.stringify({
						...payload,
						...(attachments.length ? { attachments } : {}),
						nonce: nonce.current.value,
						enforce_nonce: true,
					}),
				},
			)
			if (response.status === 429) {
				const body: unknown = await response.json()
				const retry =
					isRecord(body) &&
					typeof body.retry_after === 'number' &&
					Number.isFinite(body.retry_after)
						? body.retry_after
						: 60
				retryAt.current = Date.now() + Math.max(1000, retry * 1000)
				setMessage(
					'Discord is rate limiting messages. Wait before sending again.',
				)
				return
			}
			if (!response.ok) {
				setMessage(
					response.status === 403
						? 'The bot cannot send messages here. Check Send Messages and Embed Links permissions.'
						: `Discord rejected this message (${response.status}). Check the payload.`,
				)
				return
			}
			if (includeFiles) consumeUploads(files.map(file => file.id))
			drafts.delete(channelId)
			closeEmbedBuilder()
		} catch (error) {
			if (!controller.signal.aborted) reportError(error)
			setMessage(
				'The message could not be confirmed. Your draft is preserved. Check chat before retrying.',
			)
		} finally {
			clearTimeout(timeout)
			request.current = null
			sending.current = false
			setBusy(false)
		}
	}
	const fields = Array.isArray(embed.fields)
		? embed.fields.filter(isRecord)
		: []
	return h(
		Design.ActionSheet,
		{
			scrollable: true,
			handleDisabled: false,
			keyboardShouldPersistTaps: 'handled',
			header: h(Design.BottomSheetTitleHeader, {
				title: 'Embed Builder',
				subtitle: 'Send as the current bot. Your chat draft stays unchanged.',
			}),
			startExpanded: true,
			onDismiss: () => request.current?.abort(),
		},
		h(
			Gorhom.BottomSheetScrollView,
			{
				style: { flex: 1 },
				contentContainerStyle: { paddingBottom: 32 },
				keyboardShouldPersistTaps: 'handled',
			},
			h(Design.TableRowGroup, {
				children: [
					row(
						mode === 'embed' ? 'Mode: Embeds' : 'Mode: Components V2',
						() => {
							setMode(mode === 'embed' ? 'components' : 'embed')
							setMessage('')
						},
						busy,
						'Tap to change message type',
					),
					row(advanced ? 'Switch to form' : 'Edit full JSON', () =>
						setAdvanced(!advanced),
					),
				],
			}),
			advanced || mode === 'components'
				? input(
						mode === 'components' ? 'Components V2 JSON' : 'Message JSON',
						raw,
						setRaw,
						true,
						60000,
					)
				: h(
						View,
						null,
						input(
							'Message content',
							data.content,
							value =>
								update(draft => {
									draft.content = value
								}),
							true,
							2000,
						),
						h(Design.TableRowGroup, {
							title: `Embed ${selectedIndex + 1} of ${embeds.length}`,
							children: [
								row(
									'Next embed',
									() =>
										setSelected(
											(selectedIndex + 1) % Math.max(1, embeds.length),
										),
									busy || embeds.length < 2,
								),
								row(
									'Add embed',
									() => {
										update(draft => {
											draft.embeds = [...embeds, {}]
										})
										setSelected(embeds.length)
									},
									busy || embeds.length >= 10,
								),
								row(
									'Remove embed',
									() => {
										update(draft => {
											draft.embeds = embeds.filter(
												(_, index) => index !== selected,
											)
										})
										setSelected(Math.max(0, selectedIndex - 1))
									},
									busy || !embeds.length,
								),
							],
						}),
						field('Title', 'title'),
						field('Description', 'description', 4096, true),
						field('Embed URL', 'url', 2048),
						input(
							'Color (hex)',
							colorText,
							value => {
								setColorText(value)
								if (!value || /^#?[0-9a-f]{6}$/i.test(value))
									editEmbed(item => {
										if (value)
											item.color = Number.parseInt(value.replace('#', ''), 16)
										else item.color = undefined
									})
							},
							false,
							7,
						),
						nested('Image URL', 'image', 'url'),
						nested('Thumbnail URL', 'thumbnail', 'url'),
						nested('Author name', 'author', 'name', 256),
						nested('Author URL', 'author', 'url'),
						nested('Author icon URL', 'author', 'icon_url'),
						nested('Footer text', 'footer', 'text'),
						nested('Footer icon URL', 'footer', 'icon_url'),
						...fields.map((item, index) =>
							h(Design.TableRowGroup, {
								key: index,
								title: `Field ${index + 1}`,
								children: [
									input(
										`Field ${index + 1} name`,
										item.name,
										value =>
											editEmbed(embed => {
												if (
													Array.isArray(embed.fields) &&
													isRecord(embed.fields[index])
												)
													embed.fields[index].name = value
											}),
										false,
										256,
									),
									input(
										`Field ${index + 1} value`,
										item.value,
										value =>
											editEmbed(embed => {
												if (
													Array.isArray(embed.fields) &&
													isRecord(embed.fields[index])
												)
													embed.fields[index].value = value
											}),
										true,
										1024,
									),
									h(Design.TableSwitchRow, {
										label: 'Inline',
										value: item.inline === true,
										onValueChange: value =>
											editEmbed(embed => {
												if (
													Array.isArray(embed.fields) &&
													isRecord(embed.fields[index])
												)
													embed.fields[index].inline = value
											}),
									}),
									row(`Remove field ${index + 1}`, () =>
										editEmbed(embed => {
											if (Array.isArray(embed.fields))
												embed.fields = embed.fields.filter(
													(_, i) => i !== index,
												)
										}),
									),
								],
							}),
						),
						h(Design.TableRowGroup, {
							children: [
								row(
									'Add field',
									() =>
										editEmbed(item => {
											item.fields = [
												...fields,
												{ name: '', value: '', inline: false },
											]
										}),
									busy || fields.length >= 25,
								),
							],
						}),
					),
			files.length
				? h(Design.TableSwitchRow, {
						label: `Include queued files (${files.length})`,
						value: includeFiles,
						onValueChange: setIncludeFiles,
						disabled: busy,
					})
				: null,

			mode === 'components'
				? h(Design.TableRowGroup, {
						title: 'Add component',
						description:
							'Edit the generated JSON for full control. Custom-ID interactions must be handled by your bot.',
						children: [
							...files.map(file =>
								row(`File: ${file.filename}`, () => {
									setIncludeFiles(true)
									addComponent({
										type: 13,
										file: { url: `attachment://${uploadName(file)}` },
									})
								}),
							),
							row('Text display', () =>
								addComponent({ type: 10, content: 'Your text' }),
							),
							row('Separator', () =>
								addComponent({ type: 14, divider: true, spacing: 1 }),
							),
							row('Media gallery', () =>
								addComponent({
									type: 12,
									items: [{ media: { url: 'https://example.com/image.png' } }],
								}),
							),
							row('Section with thumbnail', () =>
								addComponent({
									type: 9,
									components: [{ type: 10, content: 'Your text' }],
									accessory: {
										type: 11,
										media: { url: 'https://example.com/image.png' },
									},
								}),
							),
							row('Link button', () =>
								addComponent({
									type: 1,
									components: [
										{
											type: 2,
											style: 5,
											label: 'Open link',
											url: 'https://example.com',
										},
									],
								}),
							),
							row('Interactive button', () =>
								addComponent({
									type: 1,
									components: [
										{
											type: 2,
											style: 1,
											label: 'Click',
											custom_id: 'button_id',
										},
									],
								}),
							),
							row('String select', () =>
								addComponent({
									type: 1,
									components: [
										{
											type: 3,
											custom_id: 'select_id',
											options: [{ label: 'Option', value: 'option' }],
										},
									],
								}),
							),
							row('Container', () =>
								addComponent({
									type: 17,
									accent_color: 0x5865f2,
									components: [{ type: 10, content: 'Your text' }],
								}),
							),
						],
					})
				: null,
			h(Design.TableRowGroup, {
				children: [
					message ? h(Design.TableRow, { label: message }) : null,
					row(busy ? 'Sending...' : 'Send message', () => {
						void send().catch(reportError)
					}),
					row('Close', closeEmbedBuilder, false),
				],
			}),
		),
	)
}
export function openEmbedBuilder(props: Omit<Props, 'initialAccount'>) {
	const initialAccount = getCurrentAccount()
	if (!hasBotToken())
		throw new Error('Switch to a bot account before using Embed Builder.')
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: Builder }),
		key,
		{ ...props, initialAccount },
		'stack',
	)
}
export function closeEmbedBuilder() {
	ActionSheetActionCreators.hideActionSheet(key)
}
