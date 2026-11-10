import { ReactNative } from '@valenced/react'
import type { Animated } from 'react-native'
export function ServerBanner({
	uri,
	bleed = 28,
	height = 140,
	scrollY,
}: {
	uri: string
	bleed?: number
	height?: number
	scrollY?: Animated.Value
}) {
	const RN = ReactNative
	const Animated = RN.Animated
	const Image = RN.Image

	const AnimatedView = Animated.View
	const translate = scrollY ? Animated.multiply(scrollY, -1) : undefined

	return (
		<AnimatedView
			pointerEvents="none"
			style={{
				position: 'absolute',
				top: 0,
				left: -bleed,
				right: -bleed,
				height: height,
				overflow: 'hidden',
				transform: translate ? [{ translateY: translate }] : undefined,
			}}
		>
			<Image
				source={{ uri }}
				style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
			/>
		</AnimatedView>
	)
}
