import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { cloneElement, isValidElement } from 'react'
import { Text, View } from 'react-native'
import { readMediaSource } from '../utils/media'
import type { ReactNode } from 'react'

export function withCopyLink(
	favorite: unknown,
	source: unknown,
	reportError: (error: unknown) => void,
) {
	const media = readMediaSource(source)
	if (
		!media ||
		!isValidElement<{
			icon?: ReactNode
			accessibilityLabel?: string
			onPress?: () => void
		}>(favorite)
	)
		return favorite
	const CopyIcon = lookupGeneratedIconComponent('CopyIcon')
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
			{favorite}
			{cloneElement(favorite, {
				key: 'media-utils-copy-link',
				icon: CopyIcon ? (
					<CopyIcon size="md" color="interactive-text-default" />
				) : (
					<Text style={{ color: 'white', fontSize: 24 }}>⧉</Text>
				),
				accessibilityLabel: 'Copy media link',
				onPress: () => {
					try {
						Clipboard.setString(media.searchUri)
					} catch (error) {
						reportError(error)
					}
				},
			})}
		</View>
	)
}
