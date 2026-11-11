import { Design } from '@valenced/discord/design'
import { memo, useEffect, useMemo, useState } from 'react'
import { Image, Pressable, SectionList, StyleSheet, View } from 'react-native'
import { EditorIconButton } from '../shared/editor-icon'
import { getEditorEmojis } from './editor-emojis'

export type EditorEmoji = string | { id: string; name: string }
const faces = [
	['😀', 'grin'],
	['😄', 'smile'],
	['😁', 'grin'],
	['😆', 'laugh'],
	['😂', 'laugh tears'],
	['🤣', 'laugh rofl'],
	['😊', 'blush smile'],
	['🙂', 'smile'],
	['🙃', 'upside down'],
	['😉', 'wink'],
	['😍', 'heart eyes'],
	['🥰', 'love'],
	['😘', 'kiss'],
	['😎', 'sunglasses cool'],
	['🤩', 'star eyes'],
	['🥳', 'party'],
	['😭', 'cry sob'],
	['🥺', 'pleading'],
	['😢', 'sad cry'],
	['😅', 'sweat smile'],
	['🤔', 'thinking'],
	['🙄', 'eye roll'],
	['😴', 'sleep'],
	['😡', 'angry'],
	['😱', 'scream'],
	['💀', 'skull'],
	['👀', 'eyes'],
	['❤️', 'red heart'],
	['💜', 'purple heart'],
	['💙', 'blue heart'],
	['👍', 'thumbs up'],
	['👎', 'thumbs down'],
	['👋', 'wave'],
	['🙌', 'hands'],
	['🙏', 'pray thanks'],
	['🤝', 'handshake'],
	['🔥', 'fire'],
	['⭐', 'star'],
	['✨', 'sparkles'],
	['🎉', 'party confetti'],
	['💯', 'hundred'],
	['✅', 'check'],
	['❌', 'cross'],
]
const cellId = (emoji: EditorEmoji) =>
	typeof emoji === 'string' ? emoji : emoji.id

type GridRow = { key: string; emojis: EditorEmoji[] }
const EmojiRow = memo(function EmojiRow({
	row,
	onEmoji,
}: {
	row: GridRow
	onEmoji(value: EditorEmoji): void
}) {
	return (
		<View style={{ flexDirection: 'row' }}>
			{row.emojis.map(emoji => (
				<Pressable
					key={cellId(emoji)}
					accessibilityRole="button"
					accessibilityLabel={typeof emoji === 'string' ? emoji : emoji.name}
					onPress={() => onEmoji(emoji)}
					style={{
						width: '12.5%',
						aspectRatio: 1,
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					{typeof emoji === 'string' ? (
						<Design.Text style={{ fontSize: 24 }}>{emoji}</Design.Text>
					) : (
						<Image
							source={{
								uri: `https://cdn.discordapp.com/emojis/${emoji.id}.png?size=32`,
							}}
							style={{ width: '76%', height: '76%' }}
							resizeMode="contain"
							resizeMethod="resize"
						/>
					)}
				</Pressable>
			))}
		</View>
	)
})

export function EmojiDrawer({
	onClose,
	onEmoji,
	recent,
	reportError,
}: {
	onClose(): void
	onEmoji(value: EditorEmoji): void
	recent: EditorEmoji[]
	reportError(error: unknown): void
}) {
	const [query, setQuery] = useState('')
	const [servers, setServers] = useState<ReturnType<typeof getEditorEmojis>>([])
	useEffect(() => {
		try {
			setServers(getEditorEmojis())
		} catch (error) {
			reportError(error)
		}
	}, [])
	const search = query.trim().toLowerCase()
	const sections = useMemo(() => {
		function section(key: string, title: string, emojis: EditorEmoji[]) {
			const data: GridRow[] = []
			for (let i = 0; i < emojis.length; i += 8)
				data.push({
					key: `${key}:${i}:${cellId(emojis[i])}`,
					emojis: emojis.slice(i, i + 8),
				})
			return { key, title, data }
		}
		return [
			...(!search && recent.length
				? [section('recent', 'Recently used', recent)]
				: []),
			section(
				'unicode',
				'Emoji',
				faces
					.filter(
						([emoji, name]) => emoji.includes(search) || name.includes(search),
					)
					.map(([emoji]) => emoji),
			),
			...servers.map(server =>
				section(
					server.id,
					server.name,
					server.emojis.filter(emoji =>
						emoji.name.toLowerCase().includes(search),
					),
				),
			),
		].filter(group => group.data.length)
	}, [recent, search, servers])
	return (
		<View
			style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
			accessibilityViewIsModal
		>
			<Pressable
				accessibilityLabel="Close emoji picker"
				onPress={onClose}
				style={[StyleSheet.absoluteFill, { backgroundColor: '#0009' }]}
			/>
			<View
				style={{
					position: 'absolute',
					top: '8%',
					bottom: 0,
					left: 0,
					right: 0,
					borderTopLeftRadius: 24,
					borderTopRightRadius: 24,
					backgroundColor: '#242429',
					paddingHorizontal: 10,
					overflow: 'hidden',
				}}
			>
				<View
					style={{
						alignSelf: 'center',
						width: 34,
						height: 4,
						marginTop: 8,
						borderRadius: 2,
						backgroundColor: '#8f9097',
					}}
				/>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between',
						paddingLeft: 8,
					}}
				>
					<Design.Text
						style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}
					>
						Emoji
					</Design.Text>
					<EditorIconButton
						name="XSmallIcon"
						label="Close emoji picker"
						onPress={onClose}
					/>
				</View>
				<Design.TextInput
					value={query}
					onChange={setQuery}
					placeholder="Find the perfect emoji"
				/>
				<SectionList<GridRow>
					sections={sections}
					keyboardShouldPersistTaps="handled"
					style={{ flex: 1, marginTop: 8 }}
					keyExtractor={item => item.key}
					initialNumToRender={8}
					maxToRenderPerBatch={4}
					windowSize={3}
					removeClippedSubviews={false}
					stickySectionHeadersEnabled
					renderSectionHeader={({ section }) => (
						<Design.Text
							style={{
								paddingVertical: 8,
								color: '#b5bac1',
								backgroundColor: '#242429',
								fontWeight: '600',
							}}
						>
							{section.title}
						</Design.Text>
					)}
					renderItem={({ item }) => <EmojiRow row={item} onEmoji={onEmoji} />}
					ListEmptyComponent={
						<Design.Text style={{ color: '#b5bac1', padding: 12 }}>
							No emoji found.
						</Design.Text>
					}
				/>
			</View>
		</View>
	)
}
