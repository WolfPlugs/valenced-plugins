import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { EditorButton, EditorIconButton } from './editor-icon'
import type { AngleAdjustment } from './transforms'

const ratios = [
	[1, 1],
	[3, 4],
	[9, 16],
	[2, 3],
	[3, 5],
	[4, 5],
	[5, 7],
] as const
export function CropPanel({
	ratio,
	landscape,
	flipped,
	originalRatio,
	onRatio,
	onOrientation,
	onFlip,
	onRotate,
	adjustment,
	onAdjustment,
}: {
	ratio: number | undefined
	landscape: boolean
	flipped: boolean
	originalRatio: number
	onRatio(value: number | undefined): void
	onOrientation(value: boolean): void
	onFlip(): void
	onRotate(): void
	adjustment: AngleAdjustment
	onAdjustment(value: typeof adjustment): void
}) {
	const [adjusting, setAdjusting] = useState(false)
	const [axis, setAxis] = useState<'straighten' | 'horizontal' | 'vertical'>(
		'straighten',
	)
	const presets = [
		{ label: 'Custom', ratio: 0, shape: 1.2 },
		{ label: 'Original', ratio: undefined, shape: originalRatio },
		...ratios.map(([w, h]) => ({
			label: landscape ? `${h}:${w}` : `${w}:${h}`,
			ratio: landscape ? h / w : w / h,
			shape: landscape ? h / w : w / h,
		})),
	]
	return (
		<View style={{ gap: 8 }}>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'center',
					alignItems: 'center',
					gap: 8,
				}}
			>
				<EditorIconButton
					name="Flip"
					label="Flip video horizontally"
					active={flipped}
					onPress={onFlip}
				/>
				<EditorIconButton
					name="Rotate"
					label="Rotate video 90 degrees"
					onPress={onRotate}
				/>
				<EditorIconButton
					name="AdjustAngle"
					label="Adjust angle"
					active={adjusting}
					onPress={() => setAdjusting(value => !value)}
				/>
			</View>
			{adjusting ? (
				<View
					style={{
						backgroundColor: '#1d1d21',
						borderRadius: 20,
						padding: 16,
						gap: 12,
					}}
				>
					<Design.Text style={{ color: '#ffffff', textAlign: 'center' }}>
						{axis === 'straighten'
							? 'Straighten'
							: axis === 'horizontal'
								? 'Horizontal'
								: 'Vertical'}{' '}
						· {adjustment[axis].toFixed(1)}°
					</Design.Text>
					<View
						style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}
					>
						{(['straighten', 'horizontal', 'vertical'] as const).map(value => (
							<EditorIconButton
								key={value}
								name={
									value === 'straighten'
										? 'AdjustAngle'
										: value === 'horizontal'
											? 'HorizontalAngle'
											: 'VerticalAngle'
								}
								label={value}
								active={axis === value}
								onPress={() => setAxis(value)}
							/>
						))}
					</View>
					<Design.Slider
						minimumValue={-45}
						maximumValue={45}
						step={0.1}
						value={adjustment[axis]}
						onValueChange={value =>
							onAdjustment({ ...adjustment, [axis]: value })
						}
					/>
					<Design.Text
						style={{ color: '#92929a', textAlign: 'center', fontSize: 12 }}
					>
						−45° 0° +45°
					</Design.Text>
				</View>
			) : (
				<View
					style={{
						backgroundColor: '#1d1d21',
						borderRadius: 20,
						paddingVertical: 10,
						gap: 8,
					}}
				>
					<View
						style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}
					>
						<EditorIconButton
							name="Portrait"
							label="Portrait presets"
							active={!landscape}
							onPress={() => onOrientation(false)}
						/>
						<EditorIconButton
							name="Landscape"
							label="Landscape presets"
							active={landscape}
							onPress={() => onOrientation(true)}
						/>
					</View>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
					>
						{presets.map(preset => {
							const selected =
								preset.ratio === ratio ||
								(preset.ratio !== undefined &&
									ratio !== undefined &&
									Math.abs(preset.ratio - ratio) < 0.0001)
							const shape = Math.max(0.2, Math.min(5, preset.shape))
							return (
								<View
									key={preset.label}
									style={{ alignItems: 'center', width: 66, gap: 4 }}
								>
									<EditorButton
										text=""
										accessibilityLabel={`${preset.label} crop`}
										accessibilityState={{ selected }}
										variant="tertiary"
										size="sm"
										style={{ width: 60, height: 44 }}
										pillStyle={{ backgroundColor: 'transparent' }}
										onPress={() => onRatio(preset.ratio)}
										icon={
											<View
												style={{
													width: shape >= 1 ? 32 : 32 * shape,
													height: shape >= 1 ? 32 / shape : 32,
													borderWidth: selected ? 2 : 1.5,
													borderColor: selected ? '#949cff' : '#92929a',
													borderRadius: 3,
													borderStyle: preset.ratio === 0 ? 'dashed' : 'solid',
												}}
											/>
										}
									/>
									<Design.Text
										style={{
											color: selected ? '#b5baff' : '#b5bac1',
											fontSize: 12,
										}}
									>
										{preset.label}
									</Design.Text>
								</View>
							)
						})}
					</ScrollView>
				</View>
			)}
		</View>
	)
}
