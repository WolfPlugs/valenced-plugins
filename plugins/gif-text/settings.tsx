import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { defaultSettings } from './config'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './config'

const { TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({ api: { jsonStorage } }: Props) {
	const settings = jsonStorage.use() ?? defaultSettings
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<TableRowGroup>
					<TableSwitchRow
						label="Attach media as files"
						subLabel="Attached the GIF or any media from the gif picker as a file to be sent along ur text"
						value={settings.attachGif}
						onValueChange={attachGif => jsonStorage.set({ attachGif })}
					/>
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}
