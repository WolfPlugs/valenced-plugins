import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { SoundGroups } from '../sound-controls/sounds'
import { readSettings, triggerLabels } from './control'
import { stopToys, useToys } from './toys'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './control'

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({ api: { jsonStorage } }: Props) {
	const settings = readSettings(jsonStorage.use())
	const [status, setStatus] = useState(
		'Choose Lovense Remote or Intiface / Buttplug, then check the connection. Discord must be running to receive triggers.',
	)
	const [busy, setBusy] = useState(false)
	const run = async (action: 'check' | 'pulse' | 'stop') => {
		setBusy(true)
		try {
			if (action === 'stop') {
				await stopToys(settings)
				setStatus('Stopped.')
			} else setStatus(await useToys(settings, action))
		} catch (error) {
			setStatus(
				error instanceof Error
					? error.message
					: 'Unable to reach the toy server.',
			)
		} finally {
			setBusy(false)
		}
	}
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<Design.TableRowGroup title="ToyLink">
					<Design.TableSwitchRow
						label="Enable automatic vibration"
						value={settings.enabled}
						onValueChange={enabled => jsonStorage.set({ enabled })}
					/>
					<Design.TableSwitchRow
						label="Use Intiface / Buttplug"
						subLabel="Off uses Lovense Remote. Changing this stops the current pulse."
						value={settings.backend === 'intiface'}
						onValueChange={enabled => {
							void stopToys()
								.then(() =>
									jsonStorage.set({
										backend: enabled ? 'intiface' : 'lovense',
									}),
								)
								.catch(error => setStatus(String(error)))
						}}
					/>
					{settings.backend === 'intiface' ? (
						<>
							<Design.TextInput
								label="Intiface WebSocket address"
								value={settings.intifaceEndpoint}
								onChange={intifaceEndpoint =>
									jsonStorage.set({ intifaceEndpoint })
								}
							/>
							<Design.TextInput
								label="Device index, blank for all vibrating toys"
								value={settings.deviceIndex}
								onChange={deviceIndex => jsonStorage.set({ deviceIndex })}
							/>
							<Design.TableRow
								label="Intiface setup"
								subLabel="Start the server and scan for toys in Intiface Central. Check connection lists device indices. Use the computer's LAN IP when connecting from your phone. Intiface pulses run while Discord is in the foreground. Stop stops all devices on this Intiface connection."
							/>
						</>
					) : (
						<>
							<Design.TextInput
								label="Lovense Remote HTTPS address"
								value={settings.endpoint}
								onChange={endpoint => jsonStorage.set({ endpoint })}
							/>
							<Design.TextInput
								label="Toy ID, blank for all connected toys"
								value={settings.toy}
								onChange={toy => jsonStorage.set({ toy })}
							/>
							<Design.TableRow
								label="Lovense setup"
								subLabel="Connect your toy in Lovense Remote and enable its LAN API. Keep Remote open on the same network."
							/>
						</>
					)}

					<Design.TableRow label="Connection" subLabel={status} />
					<Design.TableRow
						label="Check connection"
						disabled={busy}
						onPress={() => void run('check')}
					/>
					<Design.TableRow
						label="Test vibration"
						subLabel="Runs one pulse even when automatic vibration is disabled."
						disabled={busy}
						onPress={() => void run('pulse')}
					/>
					<Design.TableRow
						label="Stop vibration"
						onPress={() => void run('stop')}
					/>
					{(['strength', 'duration'] as const).map(key => (
						<Design.TableRow
							key={key}
							label={key === 'strength' ? 'Strength' : 'Duration in seconds'}
							trailing={
								<Design.TableRow.TrailingText text={String(settings[key])} />
							}
							subLabel={
								<Design.Slider
									value={settings[key]}
									minimumValue={key === 'strength' ? 1 : 2}
									maximumValue={key === 'strength' ? 20 : 10}
									step={1}
									onValueChange={value => jsonStorage.set({ [key]: value })}
								/>
							}
						/>
					))}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Message and call triggers">
					<Design.TableRow
						label="Messages"
						subLabel="Includes muted channels. Direct mentions means mentions of your user, not role or everyone mentions. Your own messages are ignored."
					/>
					{Object.entries(triggerLabels).map(([key, label]) => (
						<Design.TableSwitchRow
							key={key}
							label={label}
							value={Reflect.get(settings.triggers, key) === true}
							onValueChange={value =>
								jsonStorage.set({ triggers: { [key]: value } })
							}
						/>
					))}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Discord sound triggers">
					<Design.TableRow
						label="Sound events"
						subLabel="Triggers when Discord plays the selected sound. Silent notifications and OS notifications received while Discord is closed cannot trigger this. Events during a pulse are skipped."
					/>
					{Object.entries(SoundGroups).map(([key, group]) => (
						<Design.TableSwitchRow
							key={key}
							label={group.label}
							value={Reflect.get(settings.triggers, key) === true}
							onValueChange={value =>
								jsonStorage.set({ triggers: { [key]: value } })
							}
						/>
					))}
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}
