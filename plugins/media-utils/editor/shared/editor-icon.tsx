import { Design } from '@valenced/discord/design'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { View } from 'react-native'
import type { ComponentProps, ComponentType, ReactNode } from 'react'
import type { ViewStyle } from 'react-native'

// Discord accepts an icon element; the published Valenced types only list assets.
type IconButtonProps = Omit<
	ComponentProps<typeof Design.IconButton>,
	'icon'
> & {
	icon: ReactNode
	pillStyle?: ViewStyle
}
type EditorButtonProps = Omit<ComponentProps<typeof Design.Button>, 'icon'> & {
	icon: ReactNode
	pillStyle?: ViewStyle
}
export function EditorButton(props: EditorButtonProps) {
	const Button = Design.Button as ComponentType<EditorButtonProps>
	return <Button {...props} />
}

export function EditorIcon({
	name,
	active = false,
}: {
	name: string
	active?: boolean
}) {
	const color = active ? '#949cff' : '#ffffff'
	if (
		name === 'AdjustAngle' ||
		name === 'HorizontalAngle' ||
		name === 'VerticalAngle'
	)
		return (
			<View
				style={{
					width: 28,
					height: 28,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<View
					style={{
						width: 21,
						height: 21,
						borderWidth: 2,
						borderColor: color,
						borderRadius: 3,
						transform:
							name === 'AdjustAngle'
								? [{ rotate: '-15deg' }]
								: name === 'HorizontalAngle'
									? [{ perspective: 60 }, { rotateY: '35deg' }]
									: [{ perspective: 60 }, { rotateX: '35deg' }],
					}}
				/>
				<View
					style={{
						position: 'absolute',
						width: name === 'VerticalAngle' ? 2 : 28,
						height: name === 'VerticalAngle' ? 28 : 2,
						backgroundColor: color,
					}}
				/>
			</View>
		)
	if (name === 'Portrait' || name === 'Landscape')
		return (
			<View
				style={{
					width: name === 'Portrait' ? 15 : 25,
					height: name === 'Portrait' ? 25 : 15,
					borderWidth: 2,
					borderColor: color,
					borderRadius: 4,
				}}
			/>
		)
	if (name === 'Flip')
		return (
			<View style={{ width: 28, height: 26 }}>
				<View
					style={{
						position: 'absolute',
						left: 13,
						top: 0,
						height: 26,
						width: 2,
						backgroundColor: color,
					}}
				/>
				{[-1, 1].map(side => (
					<View
						key={side}
						style={{
							position: 'absolute',
							top: 8,
							left: side < 0 ? 2 : 19,
							width: 9,
							height: 9,
							borderLeftWidth: side < 0 ? 2 : 0,
							borderBottomWidth: side < 0 ? 2 : 0,
							borderRightWidth: side > 0 ? 2 : 0,
							borderTopWidth: side > 0 ? 2 : 0,
							borderColor: color,
							transform: [{ rotate: '45deg' }],
						}}
					/>
				))}
			</View>
		)
	if (name === 'Rotate')
		return (
			<View style={{ width: 28, height: 28 }}>
				<View
					style={{
						position: 'absolute',
						left: 4,
						top: 9,
						width: 15,
						height: 15,
						borderWidth: 2,
						borderColor: color,
						borderRadius: 3,
					}}
				/>
				<View
					style={{
						position: 'absolute',
						left: 8,
						top: 1,
						width: 17,
						height: 17,
						borderTopWidth: 2,
						borderRightWidth: 2,
						borderColor: color,
						borderTopRightRadius: 10,
					}}
				/>
				<View
					style={{
						position: 'absolute',
						left: 8,
						top: 0,
						width: 6,
						height: 6,
						borderLeftWidth: 2,
						borderTopWidth: 2,
						borderColor: color,
						transform: [{ rotate: '-45deg' }],
					}}
				/>
			</View>
		)
	if (name === 'Trim')
		return (
			<View style={{ width: 26, height: 26 }}>
				{[0, 1].map(i => (
					<View
						key={i}
						style={{
							position: 'absolute',
							left: 1,
							top: i ? 17 : 1,
							width: 8,
							height: 8,
							borderWidth: 2,
							borderColor: color,
							borderRadius: 4,
						}}
					/>
				))}
				{[-36, 36].map(angle => (
					<View
						key={angle}
						style={{
							position: 'absolute',
							left: 6,
							top: 12,
							width: 22,
							height: 2,
							backgroundColor: color,
							transform: [{ rotate: `${angle}deg` }],
						}}
					/>
				))}
			</View>
		)
	if (name === 'Crop')
		return (
			<View style={{ width: 26, height: 26 }}>
				<View
					style={{
						position: 'absolute',
						left: 5,
						top: 1,
						width: 18,
						height: 20,
						borderLeftWidth: 2,
						borderBottomWidth: 2,
						borderColor: color,
					}}
				/>
				<View
					style={{
						position: 'absolute',
						left: 1,
						top: 5,
						width: 20,
						height: 18,
						borderTopWidth: 2,
						borderRightWidth: 2,
						borderColor: color,
					}}
				/>
			</View>
		)
	const Icon = lookupGeneratedIconComponent(name)
	return Icon ? (
		<Icon
			size="md"
			color={active ? 'text-brand' : 'interactive-text-default'}
		/>
	) : null
}

export function EditorIconButton({
	name,
	label,
	active = false,
	disabled = false,
	onPress,
}: {
	name: string
	label: string
	active?: boolean
	disabled?: boolean
	onPress(): void
}) {
	const IconButton = Design.IconButton as ComponentType<IconButtonProps>
	return (
		<IconButton
			icon={<EditorIcon name={name} active={active} />}
			accessibilityLabel={label}
			accessibilityState={{ selected: active, disabled }}
			disabled={disabled}
			variant="tertiary"
			size="sm"
			pillStyle={{
				backgroundColor: active ? '#24263b' : 'transparent',
				borderRadius: 24,
			}}
			style={{
				width: 48,
				height: 48,
				paddingHorizontal: 0,
				borderRadius: 24,
				backgroundColor: 'transparent',
			}}
			onPress={onPress}
		/>
	)
}
