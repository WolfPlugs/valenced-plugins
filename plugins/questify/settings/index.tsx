import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Linking, ScrollView } from 'react-native'
import { completionTask } from '../completion/controller'
import { completion } from '../completion/service'
import { questVisible } from '../quests/filtering'
import { readQuests, refreshQuests } from '../quests/store'
import { normalizeSettings, QuestTypes } from './config'
import {
	completionAllowed,
	displayOnlySettings,
	PolicyUrl,
} from './warning-policy'
import { showUsageWarning, warnBeforeSetting } from './warnings'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './config'

const { TableRow, TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({ api: { jsonStorage } }: Props) {
	useSyncExternalStore(completion.subscribe, completion.getSnapshot)
	const settings = normalizeSettings(jsonStorage.use())
	const [snapshot, setSnapshot] = useState(() => {
		try {
			return readQuests()
		} catch {
			return { available: false, quests: [] }
		}
	})
	const [error, setError] = useState('')
	useEffect(() => {
		const timer = setInterval(() => {
			try {
				setSnapshot(readQuests())
				setError('')
			} catch {
				setError('Could not read quests on this Discord version.')
			}
		}, 5000)
		return () => clearInterval(timer)
	}, [])
	const quests = snapshot.quests.filter(quest =>
		questVisible(quest, settings, completion.canComplete),
	)
	if (settings.expiringFirst)
		quests.sort(
			(a, b) =>
				(Number.isFinite(a.expiresAt) ? a.expiresAt : Infinity) -
				(Number.isFinite(b.expiresAt) ? b.expiresAt : Infinity),
		)
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 24 }}
		>
			<Page>
				<TableRowGroup title="Usage warnings">
					<TableRow
						label="Auto-completion can lead to quest restrictions and account action"
						subLabel="No completion setting guarantees safety or avoids detection."
					/>
					<TableRow
						label="Read Discord's policy"
						onPress={() => Linking.openURL(PolicyUrl)}
					/>
					<TableSwitchRow
						label="Allow auto-completion"
						value={completionAllowed(settings)}
						onValueChange={value => {
							if (value) showUsageWarning(jsonStorage)
							else void jsonStorage.set(displayOnlySettings(settings), true)
						}}
					/>
					<TableRow
						label="Disable completion-related settings"
						subLabel="Stop active work and clear automatic types and saved resumptions. Keep quest browsing and filters."
						onPress={() => jsonStorage.set(displayOnlySettings(settings), true)}
					/>
				</TableRowGroup>
				<TableRowGroup title="Questify">
					<TableSwitchRow
						label="Notify when a quest completes"
						value={settings.notifyCompletion}
						onValueChange={notifyCompletion =>
							jsonStorage.set({ notifyCompletion })
						}
					/>
					<TableSwitchRow
						label="Hide claimed and expired quests"
						value={settings.hideFinished}
						onValueChange={hideFinished => jsonStorage.set({ hideFinished })}
					/>
					<TableSwitchRow
						label="Show expiring quests first"
						value={settings.expiringFirst}
						onValueChange={expiringFirst => jsonStorage.set({ expiringFirst })}
					/>
					<TableRow
						label="Refresh quest list"
						subLabel="Fetch current quests from Discord."
						onPress={async () => {
							try {
								await refreshQuests()
								setSnapshot(readQuests())
								setError('')
							} catch {
								setError('Could not read quests on this Discord version.')
							}
						}}
					/>
					{settings.ignored.length > 0 && (
						<TableRow
							label="Restore hidden quests"
							onPress={() => jsonStorage.set({ ignored: [] })}
						/>
					)}
				</TableRowGroup>
				<TableRowGroup title="Auto-completion">
					{(
						[
							[
								'hideNonCompletable',
								'Hide non auto-completable quests',
								'Applies to Discord’s quest list and this page.',
							],
							[
								'accelerateVideo',
								'Accelerate video quest auto-completion',
								'Count elapsed time since you accepted a video quest.',
							],
							[
								'preventVideoPausing',
								'Prevent video quests from pausing when losing focus',
								'Keeps the quest player from pausing for screen focus changes. Android may still suspend background playback.',
							],
							[
								'simultaneous',
								'Complete quests simultaneously',
								'Run queued quests together instead of one at a time.',
							],
							[
								'resumeInterrupted',
								'Resume interrupted auto-completions',
								'Restore saved work for this account after a reload or restart.',
							],
						] satisfies [
							keyof Pick<
								Settings,
								| 'hideNonCompletable'
								| 'accelerateVideo'
								| 'preventVideoPausing'
								| 'simultaneous'
								| 'resumeInterrupted'
							>,
							string,
							string,
						][]
					).map(([key, label, subLabel]) => (
						<TableSwitchRow
							key={key}
							label={label}
							subLabel={subLabel}
							value={settings[key]}
							onValueChange={value => {
								if (key === 'hideNonCompletable')
									void jsonStorage.set({ [key]: value })
								else
									warnBeforeSetting(jsonStorage, key, value, () =>
										jsonStorage.set({ [key]: value }),
									)
							}}
						/>
					))}
					<TableRow
						label="Complete supported quests"
						subLabel="Accept quests in Discord first. Video and play quests run while Discord stays open. Rewards are claimed manually."
						onPress={() => {
							try {
								for (const quest of quests)
									if (completion.canQueue(quest)) completion.queue(quest)
								setError('')
							} catch (error) {
								setError(
									error instanceof Error
										? error.message
										: 'Could not queue quests.',
								)
							}
						}}
					/>
					<TableRow
						label="Stop all quests"
						onPress={() => completion.stopAll()}
					/>
					{quests
						.filter(
							quest => completionTask(quest) || completion.state(quest.id),
						)
						.map(quest => {
							const state = completion.state(quest.id)
							const running =
								state?.kind === 'running' || state?.kind === 'queued'
							return (
								<TableRow
									key={quest.id}
									label={`${running ? 'Stop' : 'Complete'} ${quest.name}`}
									subLabel={
										state
											? 'message' in state
												? state.message
												: `${state.kind}: ${Math.floor(state.progress)} / ${state.target}`
											: 'Start this quest'
									}
									onPress={() => {
										try {
											if (running) completion.stop(quest.id)
											else completion.queue(quest)
											setError('')
										} catch (error) {
											setError(
												error instanceof Error
													? error.message
													: 'Could not start quest.',
											)
										}
									}}
								/>
							)
						})}
				</TableRowGroup>
				<TableRowGroup title="Automatically complete quest types">
					<TableRow
						label="Automatically queue accepted quests of selected types"
						subLabel="Manual completion stays available for other supported types. Stream, console, and achievement quests are not supported yet."
					/>
					{Object.entries(QuestTypes).map(([type, label]) => (
						<TableSwitchRow
							key={type}
							label={label}
							value={settings.autoTypes[type] ?? false}
							onValueChange={value =>
								warnBeforeSetting(jsonStorage, 'autoTypes', value, () =>
									jsonStorage.set({ autoTypes: { [type]: value } }),
								)
							}
						/>
					))}
				</TableRowGroup>
				<TableRowGroup title="Quests">
					{!!error && <TableRow label={error} />}
					{!snapshot.available && (
						<TableRow
							label="Quest store not available yet"
							subLabel="Open Discord's Quests screen, then return here. This Discord version may not expose the required store."
						/>
					)}
					{snapshot.available && quests.length === 0 && (
						<TableRow label="No matching quests loaded" />
					)}
					{quests.map(quest => (
						<TableRow
							key={quest.id}
							label={quest.name}
							subLabel={[
								quest.status,
								...quest.tasks.map(
									task =>
										`${task.name.replaceAll('_', ' ').toLowerCase()}: ${Math.min(100, Math.floor((task.progress / task.target) * 100))}%`,
								),
								Number.isFinite(quest.expiresAt)
									? `Expires ${new Date(quest.expiresAt).toLocaleString()}`
									: '',
							]
								.filter(Boolean)
								.join(' · ')}
							onPress={() =>
								Linking.openURL(
									`https://discord.com/quests/${encodeURIComponent(quest.id)}`,
								)
							}
						/>
					))}
				</TableRowGroup>
				<TableRowGroup title="Hide individual quests">
					{quests.map(quest => (
						<TableRow
							key={quest.id}
							label={`Hide ${quest.name}`}
							onPress={() =>
								jsonStorage.set({ ignored: [...settings.ignored, quest.id] })
							}
						/>
					))}
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}
