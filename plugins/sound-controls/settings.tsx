import Page from '@valenced/components/Page'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import { canPreview, playPreview, stopPreview } from './preview'
import { DefaultSettings, SoundGroups } from './sounds'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './sounds'

const { TableRowGroup, TableSwitchRow, Text } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({ api: { jsonStorage } }: Props) {
	useEffect(() => {
		return () => stopPreview()
	}, [])
	const settings = jsonStorage.use() ?? DefaultSettings
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<TableRowGroup>
					{Object.entries(SoundGroups).map(([group, { label, names }]) => (
						<TableSwitchRow
							key={group}
							label={label}
							value={
								!(settings.muted[group as keyof typeof SoundGroups] ?? false)
							}
							onValueChange={enabled =>
								jsonStorage.set({ muted: { [group]: !enabled } })
							}
							subLabel={
								<View
									style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}
								>
									{names.map((name, index) =>
										canPreview(name) ? (
											<Text
												key={name}
												variant="text-sm/normal"
												color="text-link"
												accessibilityRole="button"
												accessibilityLabel={`Preview ${label.toLowerCase()}${names.length > 1 ? ` ${index + 1}` : ''}`}
												onPress={event => {
													event.stopPropagation()
													void playPreview(name).catch(error =>
														ToastActionCreators.open('SOUND_PREVIEW_ERROR', {
															text:
																error instanceof Error
																	? error.message
																	: 'Unable to play this sound.',
															variant: 'critical',
														}),
													)
												}}
											>
												{names.length > 1
													? `Preview ${index + 1}`
													: 'Preview Sound'}
											</Text>
										) : (
											<Text key={name} variant="text-sm/normal">
												Preview is unavaiable
											</Text>
										),
									)}
								</View>
							}
						/>
					))}
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}
