import { Design } from '@valenced/discord/design'
import { React } from '@valenced/react'
import { Pressable, View } from 'react-native'
import { openDevicesSettings } from '../lib/modules'
import type { ReactNode } from 'react'
import type { DeviceController } from './context'

export function DeviceBadge({
	controller,
	children,
}: {
	controller: DeviceController
	children: ReactNode
}) {
	const { pending } = React.useSyncExternalStore(
		controller.tracker.subscribe,
		controller.tracker.getSnapshot,
	)
	return (
		<View collapsable={false} style={{ position: 'relative' }}>
			{children}
			{pending.length > 0 && (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`${pending.length} new devices. Open device settings`}
					onPress={() => {
						try {
							openDevicesSettings()
						} catch (error) {
							controller.reportError(error)
						}
					}}
					style={{
						position: 'absolute',
						top: -6,
						right: -6,
						borderRadius: 12,
						paddingHorizontal: 6,
						backgroundColor: '#da373c',
					}}
				>
					<Design.Text variant="text-xs/bold" style={{ color: '#fff' }}>
						+{Math.min(pending.length, 99)}
					</Design.Text>
				</Pressable>
			)}
		</View>
	)
}
