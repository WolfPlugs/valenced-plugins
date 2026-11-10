import { Design } from '@valenced/discord/design'
import { React, ReactNative } from '@valenced/react'
import { useInbox } from './context'
import { NotificationCard } from './NotificationCard'
import type { MentionSubCategory, NotificationCategory } from '../lib/types'

export const CategoryLabels = {
	mentions: 'Mentions',
	replies: 'Replies',
	reactions: 'Reactions',
	friend_request: 'Friends',
	thread: 'Threads',
	other: 'Activity',
} satisfies Record<NotificationCategory, string>
const Categories: NotificationCategory[] = [
	'mentions',
	'replies',
	'reactions',
	'friend_request',
	'thread',
	'other',
]
const MentionFilters: MentionSubCategory[] = ['all', 'people', 'role', 'bot']

export default function NotificationCenter() {
	const { inbox, refreshHistory } = useInbox()
	const [loading, setLoading] = React.useState(false)
	const [loadError, setLoadError] = React.useState<string>()
	const refresh = React.useCallback(async () => {
		setLoading(true)
		setLoadError(undefined)
		try {
			await refreshHistory?.()
		} catch (error) {
			setLoadError(
				error instanceof Error
					? error.message
					: 'Could not refresh notification history.',
			)
		} finally {
			setLoading(false)
		}
	}, [refreshHistory])
	React.useEffect(() => {
		void refresh()
	}, [refresh])
	const { View, ScrollView, FlatList } = ReactNative
	const { Button, Text } = Design
	const [category, setCategory] = React.useState<NotificationCategory | 'all'>(
		'all',
	)
	const [filter, setFilter] = React.useState<MentionSubCategory>('all')
	const items = React.useSyncExternalStore(inbox.subscribe, inbox.getSnapshot)
	const displayed = items.filter(
		item =>
			(category === 'all' || item.category === category) &&
			(category !== 'mentions' ||
				filter === 'all' ||
				item.subCategory === filter),
	)
	const counts = new Map<NotificationCategory, number>()
	for (const item of items)
		counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
	return (
		<View style={{ flex: 1, minHeight: 300 }}>
			<View style={{ paddingHorizontal: 12, paddingTop: 8 }}>
				<Button
					text={loading ? 'Syncing notifications…' : 'Refresh notifications'}
					loading={loading}
					disabled={loading}
					size="sm"
					variant="tertiary"
					onPress={() => {
						void refresh()
					}}
				/>
				{loadError && (
					<Text variant="text-sm/normal" color="text-muted">
						{loadError}
					</Text>
				)}
			</View>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				style={{ flexGrow: 0 }}
				contentContainerStyle={{ padding: 12, gap: 8 }}
			>
				{(['all', ...Categories] as const).map(value => (
					<Button
						key={value}
						size="sm"
						variant={category === value ? 'primary' : 'secondary'}
						text={`${value === 'all' ? 'All' : CategoryLabels[value]}${value === 'all' ? ` (${items.length})` : counts.get(value) ? ` (${counts.get(value)})` : ''}`}
						accessibilityState={{ selected: category === value }}
						onPress={() => setCategory(value)}
					/>
				))}
			</ScrollView>
			{category === 'mentions' && (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ flexGrow: 0 }}
					contentContainerStyle={{
						paddingHorizontal: 12,
						paddingBottom: 8,
						gap: 8,
					}}
				>
					{MentionFilters.map(value => (
						<Button
							key={value}
							text={value[0].toUpperCase() + value.slice(1)}
							size="sm"
							variant={filter === value ? 'primary' : 'secondary'}
							accessibilityState={{ selected: filter === value }}
							onPress={() => setFilter(value)}
						/>
					))}
				</ScrollView>
			)}
			{(category === 'all' ? items.length : (counts.get(category) ?? 0)) >
				0 && (
				<View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
					<Button
						text={`Clear ${category === 'all' ? 'all' : CategoryLabels[category]}`}
						variant="tertiary"
						size="sm"
						onPress={() =>
							inbox.clear(category === 'all' ? undefined : category)
						}
					/>
				</View>
			)}
			<FlatList
				data={displayed}
				keyExtractor={item => item.id}
				contentContainerStyle={{ padding: 12, paddingBottom: 40, gap: 8 }}
				renderItem={({ item }) => <NotificationCard item={item} />}
				ListEmptyComponent={
					<Text
						variant="text-md/normal"
						color="text-muted"
						style={{ padding: 32, textAlign: 'center' }}
					>
						{category === 'all'
							? 'No notifications found.'
							: `No ${CategoryLabels[category].toLowerCase()} notifications found.`}
					</Text>
				}
			/>
		</View>
	)
}
