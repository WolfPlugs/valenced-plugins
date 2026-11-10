import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
import { openUserProfileSheet } from '../lib/modules'

export interface ServerRowsProps {
	guildId: string
	ownerId: string | null
	ownerDisplayName: string | null
	ownerAvatarUri: string | undefined
	createdLabel: string | undefined
}

export function ServerRows({
	guildId,
	ownerId,
	ownerDisplayName,
	ownerAvatarUri,
	createdLabel,
}: ServerRowsProps) {
	const { View, Image } = ReactNative
	const { TableRow, TableRowGroup, Text } = Design

	return (
		<TableRowGroup title="Server">
			<TableRow
				label="Owner"
				trailing={
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: 8,
						}}
					>
						{ownerAvatarUri != null && (
							<Image
								source={{ uri: ownerAvatarUri }}
								style={{ width: 24, height: 24, borderRadius: 12 }}
							/>
						)}
						<Text
							variant="text-md/medium"
							color={ownerId ? 'text-link' : 'text-default'}
						>
							{ownerDisplayName ?? '—'}
						</Text>
					</View>
				}
				onPress={
					ownerId
						? () => {
								openUserProfileSheet({
									userId: ownerId,
									guildId,
									ignoreBlockedSpeedBump: false,
								})
							}
						: undefined
				}
			/>
			<TableRow
				label="Created"
				trailing={<TableRow.TrailingText text={createdLabel ?? '—'} />}
			/>
			<TableRow
				label="ID"
				trailing={<TableRow.TrailingText text={guildId} />}
			/>
		</TableRowGroup>
	)
}
