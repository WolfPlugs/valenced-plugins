import Page from '@valenced/components/Page'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { readSettings } from './config'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings, SettingsStore } from './config'

const options = [
	['rotateImages', 'Rotate images'],
	['rotateVideos', 'Rotate videos'],
	['zoomEnabled', 'Pinch and double-tap zoom'],
	['fullResolution', 'Load full-resolution images on zoom'],
	['favoriteMedia', 'Favorite images and videos'],
] satisfies [Exclude<keyof Settings, 'doubleTapZoom'>, string][]
const optionsKey = 'wolfie.media-utils.options'

export function MediaControls({ store }: { store: SettingsStore }) {
	const settings = readSettings(store.use())
	return (
		<>
			<Design.TableRowGroup title="Media controls">
				{options.map(([key, label]) => (
					<Design.TableCheckboxRow
						key={key}
						value={key}
						label={label}
						checked={settings[key]}
						onPress={() => store.set({ [key]: !settings[key] })}
					/>
				))}
			</Design.TableRowGroup>
			<Design.TableRowGroup title="Zoom">
				<Design.TableRow
					label="Double-tap zoom"
					trailing={
						<Design.TableRow.TrailingText text={`${settings.doubleTapZoom}×`} />
					}
					subLabel={
						<Design.Slider
							value={settings.doubleTapZoom}
							minimumValue={2}
							maximumValue={10}
							step={1}
							onValueChange={doubleTapZoom => store.set({ doubleTapZoom })}
						/>
					}
				/>
			</Design.TableRowGroup>
		</>
	)
}
function OptionsSheet({ store }: { store: SettingsStore }) {
	return (
		<Design.ActionSheet
			scrollable
			header={<Design.BottomSheetTitleHeader title="Media options" />}
		>
			<Page>
				<MediaControls store={store} />
			</Page>
		</Design.ActionSheet>
	)
}
export function openMediaOptions(store: SettingsStore) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: OptionsSheet }),
		optionsKey,
		{ store },
		'stack',
	)
}
export function closeMediaOptions() {
	ActionSheetActionCreators.hideActionSheet(optionsKey)
}
type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>
export default function SettingsComponent({ api: { jsonStorage } }: Props) {
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<MediaControls store={jsonStorage} />
			</Page>
		</ScrollView>
	)
}
