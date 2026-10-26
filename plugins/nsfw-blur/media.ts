export type Channel = { nsfw?: boolean; parent_id?: string }

export function isNsfwChannel(
	channel: Channel | undefined,
	getChannel: (id: string) => Channel | undefined,
): boolean {
	return (
		channel?.nsfw === true ||
		(typeof channel?.parent_id === 'string' &&
			getChannel(channel.parent_id)?.nsfw === true)
	)
}

export function isVisualAttachment(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	if (
		'content_type' in value &&
		typeof value.content_type === 'string' &&
		/^(image|video)\//i.test(value.content_type)
	)
		return true
	return (
		'filename' in value &&
		typeof value.filename === 'string' &&
		/\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|mp4|webm|mov|m4v|mkv)$/i.test(
			value.filename,
		)
	)
}

export function withBlur(value: unknown, embedded: boolean): unknown {
	if (typeof value !== 'object' || value === null) return value
	const alreadyObscured = embedded
		? 'isObscured' in value && value.isObscured === true
		: 'obscure' in value && value.obscure === true
	if (alreadyObscured) return value
	return embedded
		? {
				...value,
				isObscured: true,
				obscureDescription: 'Tap to reveal',
				obscureIsOpaque: false,
			}
		: {
				...value,
				obscure: true,
				obscureDescription: 'Tap to reveal',
				obscureIsOpaque: false,
			}
}

export function blurEmbeds(value: unknown): unknown {
	if (!Array.isArray(value)) return value
	return value.map(embed => {
		if (typeof embed !== 'object' || embed === null) return embed
		if (
			!embed.image &&
			!embed.thumbnail &&
			!embed.video &&
			!embed.images?.length
		)
			return embed
		if (embed.obscure) return embed
		return { ...embed, obscure: 'Tap to reveal', obscureIsOpaque: false }
	})
}
