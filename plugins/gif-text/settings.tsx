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
	const settings = { ...defaultSettings, ...jsonStorage.use() }
	return (
		<ScrollView style={{ flex: 1 }}>
			<Page>
				<TableRowGroup>
					<TableSwitchRow
						label="Attach as file by default"
						subLabel="Tap a GIF to attach it as a file. Turn off to add its link to your draft."
						value={settings.attachGif}
						onValueChange={attachGif => jsonStorage.set({ attachGif })}
					/>
				</TableRowGroup>
				<TableRowGroup title="GIF long-press menu">
					<TableSwitchRow
						label="Show Send to chat"
						subLabel="Add the GIF link to your message draft."
						value={settings.showSendToChat}
						onValueChange={showSendToChat =>
							jsonStorage.set({ showSendToChat })
						}
					/>
					<TableSwitchRow
						label="Show Attach as file"
						subLabel="Download and attach the GIF to your message draft as a file."
						value={settings.showAttachFile}
						onValueChange={showAttachFile =>
							jsonStorage.set({ showAttachFile })
						}
					/>
					<TableSwitchRow
						label="Show Copy Link"
						subLabel="Show the option to copy the GIF link to your clipboard."
						value={!settings.hideCopyLink}
						onValueChange={showCopyLink =>
							jsonStorage.set({ hideCopyLink: !showCopyLink })
						}
					/>
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}
