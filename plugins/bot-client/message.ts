import { isRecord } from './protocol'

export const ComponentsV2Flag = 1 << 15

function text(value: unknown, limit: number, name: string, required = false) {
	if (value === undefined && !required) return 0
	if (
		typeof value !== 'string' ||
		(required && !value.trim()) ||
		value.length > limit
	)
		throw new Error(
			`${name} must contain ${required ? '1' : '0'} to ${limit} characters.`,
		)
	return value.length
}
function url(value: unknown, name: string, attachmentNames: string[] = []) {
	if (value === undefined) return
	if (
		typeof value === 'string' &&
		value.startsWith('attachment://') &&
		attachmentNames.includes(value.slice(13))
	)
		return
	if (typeof value !== 'string' || !/^https?:\/\/\S+$/i.test(value))
		throw new Error(`${name} must be an HTTP or HTTPS URL.`)
}
function color(value: unknown) {
	if (
		value !== undefined &&
		value !== null &&
		(typeof value !== 'number' ||
			!Number.isInteger(value) ||
			value < 0 ||
			value > 0xffffff)
	)
		throw new Error('Color must be an integer between 0 and 16777215.')
}
function embeds(value: unknown, attachmentNames: string[]) {
	if (!Array.isArray(value) || value.length > 10)
		throw new Error('A message supports up to 10 embeds.')
	let length = 0
	for (const embed of value) {
		if (!isRecord(embed)) throw new Error('Each embed must be an object.')
		if (
			!embed.title &&
			!embed.description &&
			!embed.image &&
			!embed.thumbnail &&
			!embed.author &&
			!embed.footer &&
			!(Array.isArray(embed.fields) && embed.fields.length)
		)
			throw new Error('Each embed needs text, fields, or an image.')
		length +=
			text(embed.title, 256, 'Title') +
			text(embed.description, 4096, 'Description')
		url(embed.url, 'Embed URL')
		color(embed.color)
		for (const key of ['image', 'thumbnail']) {
			if (embed[key] !== undefined) {
				if (!isRecord(embed[key])) throw new Error(`${key} must be an object.`)
				url(embed[key].url, key, attachmentNames)
			}
		}
		if (embed.author !== undefined) {
			if (!isRecord(embed.author)) throw new Error('Author must be an object.')
			length += text(embed.author.name, 256, 'Author name', true)
			url(embed.author.url, 'Author URL')
			url(embed.author.icon_url, 'Author icon', attachmentNames)
		}
		if (embed.footer !== undefined) {
			if (!isRecord(embed.footer)) throw new Error('Footer must be an object.')
			length += text(embed.footer.text, 2048, 'Footer text', true)
			url(embed.footer.icon_url, 'Footer icon', attachmentNames)
		}
		if (embed.fields !== undefined) {
			if (!Array.isArray(embed.fields) || embed.fields.length > 25)
				throw new Error('An embed supports up to 25 fields.')
			for (const field of embed.fields) {
				if (!isRecord(field)) throw new Error('Embed fields must be objects.')
				length +=
					text(field.name, 256, 'Field name', true) +
					text(field.value, 1024, 'Field value', true)
			}
		}
	}
	if (length > 6000)
		throw new Error('All embeds combined must stay within 6000 characters.')
	return value
}
function components(value: unknown, attachmentNames: string[]) {
	if (!Array.isArray(value) || !value.length)
		throw new Error('Add at least one component.')
	let count = 0
	let length = 0
	const ids = new Set<string>()
	const numericIds = new Set<number>()
	function visit(node: unknown, allowed: number[]) {
		if (++count > 40)
			throw new Error('A Components V2 message supports up to 40 components.')
		if (
			!isRecord(node) ||
			typeof node.type !== 'number' ||
			!allowed.includes(node.type)
		)
			throw new Error('Unsupported component type or nesting.')
		if (node.id !== undefined && node.id !== 0) {
			if (
				typeof node.id !== 'number' ||
				!Number.isInteger(node.id) ||
				node.id < 0 ||
				node.id > 0xffffffff ||
				numericIds.has(node.id)
			)
				throw new Error(
					'Component IDs must be unique positive 32-bit integers.',
				)
			numericIds.add(node.id)
		}
		if (node.custom_id !== undefined) {
			text(node.custom_id, 100, 'Custom ID', true)
			if (typeof node.custom_id === 'string') {
				if (ids.has(node.custom_id))
					throw new Error('Custom IDs must be unique within the message.')
				ids.add(node.custom_id)
			}
		}
		switch (node.type) {
			case 1:
				if (
					!Array.isArray(node.components) ||
					!node.components.length ||
					node.components.length > 5
				)
					throw new Error(
						'Action rows require 1 to 5 buttons or one select menu.',
					)
				if (
					node.components.some(child => !isRecord(child) || child.type !== 2) &&
					node.components.length !== 1
				)
					throw new Error('A select menu needs its own action row.')
				for (const child of node.components) visit(child, [2, 3, 5, 6, 7, 8])
				break
			case 2:
				text(node.label, 80, 'Button label')
				if (![1, 2, 3, 4, 5, 6].includes(Number(node.style)))
					throw new Error('Invalid button style.')
				if (node.style === 5) {
					if (!node.url || node.custom_id !== undefined)
						throw new Error('Link buttons need a URL and no custom ID.')
					url(node.url, 'Button URL')
				} else if (node.style === 6) {
					if (typeof node.sku_id !== 'string')
						throw new Error('Premium buttons need a SKU ID.')
				} else text(node.custom_id, 100, 'Button custom ID', true)
				break
			case 3:
			case 5:
			case 6:
			case 7:
			case 8:
				text(node.custom_id, 100, 'Select custom ID', true)
				if (
					node.type === 3 &&
					(!Array.isArray(node.options) ||
						!node.options.length ||
						node.options.length > 25)
				)
					throw new Error('String selects require 1 to 25 options.')
				break
			case 9:
				if (
					!Array.isArray(node.components) ||
					!node.components.length ||
					node.components.length > 3
				)
					throw new Error('Sections require 1 to 3 text blocks.')
				for (const child of node.components) visit(child, [10])
				visit(node.accessory, [2, 11])
				break
			case 10:
				length += text(node.content, 4000, 'Text display', true)
				break
			case 11:
				if (!isRecord(node.media) || !node.media.url)
					throw new Error('Thumbnails require a media URL.')
				url(node.media.url, 'Thumbnail URL', attachmentNames)
				break
			case 12:
				if (
					!Array.isArray(node.items) ||
					!node.items.length ||
					node.items.length > 10
				)
					throw new Error('Media galleries require 1 to 10 items.')
				for (const item of node.items) {
					if (!isRecord(item) || !isRecord(item.media) || !item.media.url)
						throw new Error('Gallery items require media URLs.')
					url(item.media.url, 'Gallery URL', attachmentNames)
				}
				break
			case 13:
				if (
					!isRecord(node.file) ||
					typeof node.file.url !== 'string' ||
					!node.file.url.startsWith('attachment://') ||
					!attachmentNames.includes(node.file.url.slice(13))
				)
					throw new Error(
						'File components must reference a queued file with Include queued files enabled.',
					)
				break
			case 14:
				if (
					node.spacing !== undefined &&
					node.spacing !== 1 &&
					node.spacing !== 2
				)
					throw new Error('Separator spacing must be 1 or 2.')
				break
			case 17:
				color(node.accent_color)
				if (!Array.isArray(node.components) || !node.components.length)
					throw new Error('Containers need at least one component.')
				for (const child of node.components)
					visit(child, [1, 9, 10, 12, 13, 14])
		}
	}
	for (const node of value) visit(node, [1, 9, 10, 12, 13, 14, 17])
	if (length > 4000)
		throw new Error(
			'Component text must stay within 4000 characters per message.',
		)
	return value
}
export function buildMessage(
	raw: string,
	mode: 'embed' | 'components',
	attachmentNames: string[] = [],
) {
	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch {
		throw new Error('Enter valid JSON before sending.')
	}
	if (!isRecord(data)) throw new Error('The message must be a JSON object.')
	if (mode === 'components') {
		if (data.content || (Array.isArray(data.embeds) && data.embeds.length))
			throw new Error(
				'Components V2 cannot be combined with content or embeds.',
			)
		return {
			flags: ComponentsV2Flag,
			components: components(data.components, attachmentNames),
			allowed_mentions: { parse: [] },
		}
	}
	if (data.components !== undefined)
		throw new Error('Switch to Components V2 mode to send components.')
	text(data.content, 2000, 'Message content')
	const result = embeds(data.embeds ?? [], attachmentNames)
	if (!data.content && !result.length)
		throw new Error('Add message content or an embed.')
	return {
		content: data.content ?? '',
		embeds: result,
		allowed_mentions: { parse: [] },
	}
}
