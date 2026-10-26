import { getAssetIdByName } from '@valenced/assets'
import { Image } from 'react-native'
import type { ColorValue, ImageProps } from 'react-native'

export default function MediaOptionsIcon({
	color,
	style,
	...props
}: ImageProps & { color?: ColorValue }) {
	return (
		<Image
			{...props}
			source={getAssetIdByName('SettingsIcon')}
			style={[{ width: 24, height: 24, tintColor: color }, style]}
		/>
	)
}
