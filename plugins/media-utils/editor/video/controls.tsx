import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import { EditorButton, EditorIcon } from '../shared/editor-icon'
import { SoundPanel } from './sound-panel'
import { Timeline } from './timeline'
import type { ComponentProps, ReactNode } from 'react'
import type { CanvasCommand } from '../protocol'
import type { EditorTool } from '../types'

export function VideoControls({
	tool,
	playing,
	resetKey,
	timeline,
	sound,
	onCommand,
	children,
}: {
	tool: EditorTool
	playing: boolean
	resetKey: number
	timeline: ComponentProps<typeof Timeline>
	sound: ComponentProps<typeof SoundPanel>
	onCommand(command: CanvasCommand): void
	children: ReactNode
}) {
	const { start, end, position } = timeline
	return (
		<>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<View style={{ flex: 1, alignItems: 'center' }}>
					<EditorButton
						text={`${Math.max(0, position - start).toFixed(1)} / ${(end - start).toFixed(1)}s`}
						accessibilityLabel={playing ? 'Pause preview' : 'Play preview'}
						variant="tertiary"
						size="sm"
						style={{
							borderRadius: 24,
							backgroundColor: '#232323',
							paddingHorizontal: 18,
						}}
						icon={<EditorIcon name={playing ? 'PauseIcon' : 'PlayIcon'} />}
						onPress={() => onCommand({ type: 'preview' })}
					/>
				</View>
			</View>
			{tool === 'Trim' && <Timeline key={resetKey} {...timeline} />}
			{children}
			{(tool === 'Crop' || tool === 'Sound') && (
				<Design.Slider
					minimumValue={start}
					maximumValue={end}
					step={0.01}
					value={Math.max(start, Math.min(end, position))}
					onValueChange={time => onCommand({ type: 'seek', time })}
				/>
			)}
			{tool === 'Sound' && <SoundPanel {...sound} />}
		</>
	)
}
