import { expect, test } from 'bun:test'
import { buildMessage, ComponentsV2Flag } from '../plugins/bot-client/message'

test('builds embeds with fields and disables accidental mentions', () => {
	const embed = {
		title: 'Title',
		description: 'Description',
		color: 0x5865f2,
		image: { url: 'https://example.com/image.png' },
		fields: [{ name: 'Name', value: 'Value', inline: true }],
	}
	expect(
		buildMessage(
			JSON.stringify({ content: 'Hello', embeds: [embed] }),
			'embed',
		),
	).toEqual({
		content: 'Hello',
		embeds: [embed],
		allowed_mentions: { parse: [] },
	})
})
test('validates embed limits across the whole message', () => {
	for (const draft of [
		{ embeds: [{ title: 'x'.repeat(257) }] },
		{ embeds: [{ title: 'Title', fields: [{ name: 'Name', value: '' }] }] },
		{ embeds: Array.from({ length: 11 }, () => ({ title: 'Title' })) },
		{
			embeds: [
				{ description: 'x'.repeat(3500) },
				{ description: 'x'.repeat(3500) },
			],
		},
		{ embeds: [{}] },
		{ embeds: [{ image: { url: 'javascript:alert(1)' } }] },
	])
		expect(() => buildMessage(JSON.stringify(draft), 'embed')).toThrow()
})
test('builds nested Components V2 with the required flag', () => {
	const components = [
		{
			type: 17,
			components: [
				{ type: 10, content: 'Text' },
				{
					type: 1,
					components: [
						{ type: 2, style: 5, label: 'Link', url: 'https://example.com' },
					],
				},
			],
		},
	]
	expect(buildMessage(JSON.stringify({ components }), 'components')).toEqual({
		components,
		flags: ComponentsV2Flag,
		allowed_mentions: { parse: [] },
	})
})
test('rejects mixed V2 payloads, invalid nesting, duplicates, and excessive component counts', () => {
	const text = { type: 10, content: 'Text' }
	for (const draft of [
		{ components: [text], content: 'Legacy' },
		{ components: [text], embeds: [{ title: 'Legacy' }] },
		{ components: Array.from({ length: 41 }, () => text) },
		{
			components: [
				{ type: 17, components: [{ type: 17, components: [text] }] },
			],
		},
		{ components: [{ type: 9, components: [text] }] },
		{
			components: [
				{
					type: 1,
					components: [
						{ type: 2, style: 1, label: 'One', custom_id: 'duplicate' },
						{ type: 2, style: 1, label: 'Two', custom_id: 'duplicate' },
					],
				},
			],
		},
		{ components: [{ type: 4, custom_id: 'modal_input' }] },
		{ components: [] },
	])
		expect(() => buildMessage(JSON.stringify(draft), 'components')).toThrow()
})
test('rejects malformed JSON and accepts sections and gallery items', () => {
	expect(() => buildMessage('{', 'embed')).toThrow('JSON')
	const components = [
		{
			type: 9,
			components: [{ type: 10, content: 'Text' }],
			accessory: { type: 11, media: { url: 'https://example.com/image.png' } },
		},
		{ type: 12, items: [{ media: { url: 'https://example.com/image.png' } }] },
	]
	expect(
		buildMessage(JSON.stringify({ components }), 'components'),
	).toHaveProperty('flags', 32768)
})

test('validates file and media components against queued attachment names', () => {
	const components = [
		{ type: 13, file: { url: 'attachment://notes.txt' } },
		{ type: 12, items: [{ media: { url: 'attachment://image.png' } }] },
	]
	expect(
		buildMessage(JSON.stringify({ components }), 'components', [
			'notes.txt',
			'image.png',
		]),
	).toHaveProperty('flags', 32768)
	expect(() =>
		buildMessage(JSON.stringify({ components }), 'components'),
	).toThrow()
	expect(
		buildMessage(
			JSON.stringify({
				embeds: [{ image: { url: 'attachment://image.png' } }],
			}),
			'embed',
			['image.png'],
		),
	).toHaveProperty('embeds')
})
