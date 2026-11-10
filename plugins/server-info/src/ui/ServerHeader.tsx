import { Design } from '@valenced/discord/design'
import { ReactNative } from '@valenced/react'
export interface ServerHeaderProps {
	name: string
	description: string | null | undefined
	iconUri: string | undefined
}

export function ServerHeader({
	name,
	description,
	iconUri,
}: ServerHeaderProps) {
	const { View, Image } = ReactNative
	const { Text } = Design

	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 12,
				paddingTop: 16,
				paddingBottom: 8,
			}}
		>
			{iconUri != null && (
				<Image
					source={{ uri: iconUri }}
					style={{ width: 56, height: 56, borderRadius: 14 }}
				/>
			)}
			<View style={{ flex: 1 }}>
				<Text variant="text-lg/semibold" color="text-default" lineClamp={1}>
					{name}
				</Text>
				{description != null && description.length > 0 && (
					<Text variant="text-sm/normal" color="text-subtle" lineClamp={2}>
						{description}
					</Text>
				)}
			</View>
		</View>
	)
}
