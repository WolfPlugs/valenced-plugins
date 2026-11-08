import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import { EditorIcon, EditorIconButton } from '../shared/editor-icon'

export function SoundPanel({
	volume,
	soundtrack,
	musicVolume,
	loading,
	onVolume,
	onMusicVolume,
	onPick,
	onRemove,
}: {
	volume: number
	soundtrack: string | null
	musicVolume: number
	loading: boolean
	onVolume(value: number): void
	onMusicVolume(value: number): void
	onPick(): void
	onRemove(): void
}) {
	return (
		<View
			style={{
				paddingHorizontal: 16,
				paddingVertical: 12,
				gap: 12,
				minHeight: 180,
			}}
		>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<Design.Text style={{ color: '#ffffff', fontSize: 16 }}>
					Video sound
				</Design.Text>
				<Design.Button
					text={
						loading
							? 'Loading…'
							: soundtrack
								? 'Replace soundtrack'
								: 'Add soundtrack'
					}
					variant="tertiary"
					size="sm"
					disabled={loading}
					onPress={onPick}
					style={{ backgroundColor: 'transparent' }}
				/>
			</View>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
				<EditorIcon name={volume === 0 ? 'VoiceXIcon' : 'VoiceNormalIcon'} />
				<View style={{ flex: 1 }}>
					<Design.Slider
						minimumValue={0}
						maximumValue={100}
						step={1}
						value={volume}
						onValueChange={onVolume}
					/>
				</View>
				<Design.Text
					style={{ color: '#b5bac1', width: 40, textAlign: 'right' }}
				>
					{Math.round(volume)}%
				</Design.Text>
			</View>
			{soundtrack && (
				<>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
						<EditorIcon name="MusicIcon" />
						<Design.Text
							numberOfLines={1}
							style={{ color: '#ffffff', flex: 1 }}
						>
							{soundtrack}
						</Design.Text>
						<EditorIconButton
							name="XSmallIcon"
							label="Remove soundtrack"
							disabled={loading}
							onPress={onRemove}
						/>
					</View>
					<Design.Slider
						minimumValue={0}
						maximumValue={100}
						step={1}
						value={musicVolume}
						onValueChange={onMusicVolume}
					/>
				</>
			)}
		</View>
	)
}
