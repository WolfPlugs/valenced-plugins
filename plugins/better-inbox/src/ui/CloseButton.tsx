import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import type { ComponentProps, ComponentType, ReactNode } from 'react'

type Props = Omit<ComponentProps<typeof Design.IconButton>, 'icon'> & {
	icon: ReactNode
}
export function CloseButton({ onPress }: { onPress(): void }) {
	const Icon = lookupGeneratedIconComponent('XSmallIcon', 'XIcon')
	if (!Icon)
		return (
			<Design.Button
				text="×"
				accessibilityLabel="Close inbox"
				variant="tertiary"
				size="sm"
				onPress={onPress}
			/>
		)
	// Discord accepts icon elements in addition to asset IDs.
	const IconButton = Design.IconButton as ComponentType<Props>
	return (
		<IconButton
			icon={<Icon size="md" />}
			accessibilityLabel="Close inbox"
			variant="tertiary"
			size="sm"
			onPress={onPress}
		/>
	)
}
