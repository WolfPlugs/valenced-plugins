import React from 'react'
import type { PluginApi } from '@valenced/plugins/types'
import { DEFAULT_STORAGE } from '../lib/types'
import type { MoreAltsStorage, Account } from '../lib/types'
import {
	getCurrentUser,
	getAllAccounts,
	switchToAccount,
	removeAccount,
	forceLogout,
	exportAccountsJson,
	importAccountsJson,
} from '../lib/accountActions'
import { openAddAccountSheet } from './AddAccountSheet'
import { openAccountSwitcherSheet } from './AccountSwitcherSheet'

export { openAddAccountSheet, openAccountSwitcherSheet }

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

function formatDate(ts: number): string {
	return new Date(ts).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: MoreAltsStorage }>
}) {
	const rev = getValenced()
	const { ScrollView, View, Image, Alert } = rev.react.ReactNative
	const {
		TableRowGroup,
		TableSwitchRow,
		TableRow,
		Stack,
		Text,
		Button,
	} = rev.discord.design.Design as any

	const rawStorage = api.jsonStorage.use() as Partial<MoreAltsStorage> | undefined
	const storage: MoreAltsStorage = {
		...DEFAULT_STORAGE,
		...(rawStorage ?? {}),
	}

	const currentUser = getCurrentUser()
	const currentUserId = currentUser?.id
	const accounts = getAllAccounts(api.jsonStorage)

	const currentAvatarUrl = currentUser?.avatar
		? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=80`
		: 'https://cdn.discordapp.com/embed/avatars/0.png'

	const handleSwitch = async (account: Account) => {
		if (account.id === currentUserId) return
		const target = account.token || account.id
		await switchToAccount(target, account.isNative)
	}

	const handleRemove = (account: Account) => {
		if (storage.confirmBeforeDelete !== false) {
			Alert.alert(
				'Remove Account',
				`Are you sure you want to remove "${account.username}" from More Alts?`,
				[
					{ text: 'Cancel', style: 'cancel' },
					{
						text: 'Remove',
						style: 'destructive',
						onPress: () => {
							void removeAccount(api.jsonStorage, account.id)
						},
					},
				],
			)
		} else {
			void removeAccount(api.jsonStorage, account.id)
		}
	}

	const handleAccountPress = (account: Account) => {
		if (account.id === currentUserId) return
		Alert.alert(
			account.displayName || account.username,
			`Choose an action for @${account.username}:`,
			[
				{
					text: 'Switch to this Account',
					onPress: () => void handleSwitch(account),
				},
				{
					text: 'Remove Account',
					style: 'destructive',
					onPress: () => handleRemove(account),
				},
				{ text: 'Cancel', style: 'cancel' },
			],
		)
	}

	const copyToClipboard = (text: string, successMsg: string) => {
		try {
			const clip =
				rev.discord?.common?.Clipboard ??
				rev.externals?.ReactNativeClipboard
			if (clip?.setString) {
				clip.setString(text)
				Alert.alert('Copied', successMsg)
				return
			}
		} catch {}
		Alert.alert('Copy Failed', 'Unable to access clipboard.')
	}

	const handleExport = () => {
		const json = exportAccountsJson(api.jsonStorage)
		copyToClipboard(
			json,
			`Exported ${accounts.length} accounts to clipboard!`,
		)
	}

	const handleImport = async () => {
		try {
			const clip =
				rev.discord?.common?.Clipboard ??
				rev.externals?.ReactNativeClipboard
			const clipboardText = (await clip?.getString?.()) || ''
			if (!clipboardText.trim()) {
				Alert.alert(
					'Import',
					'Clipboard is empty. Please copy valid export JSON first.',
				)
				return
			}

			const res = await importAccountsJson(api.jsonStorage, clipboardText)
			if (res.success) {
				Alert.alert(
					'Import Complete',
					`Imported ${res.imported} accounts (${res.skipped} skipped duplicates).`,
				)
			} else {
				Alert.alert('Import Failed', res.message || 'Invalid JSON format')
			}
		} catch (e: any) {
			Alert.alert('Import Error', e?.message ?? String(e))
		}
	}

	return (
		<ScrollView
			style={{ flex: 1, backgroundColor: '#111214' }}
			contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
			keyboardShouldPersistTaps="handled"
		>
			<Stack spacing={16}>
				<TableRowGroup title="CURRENT ACCOUNT">
					<TableRow
						icon={
							<Image
								source={{ uri: currentAvatarUrl }}
								style={{
									width: 38,
									height: 38,
									borderRadius: 19,
									borderWidth: 2,
									borderColor: '#23a55a',
								}}
							/>
						}
						label={
							<Text variant="text-md/semibold" color="text-default">
								{currentUser?.globalName || currentUser?.username || 'Current User'}
							</Text>
						}
						subLabel={
							currentUser?.username
								? `@${currentUser.username} • Active Session`
								: 'Active Session'
						}
						trailing={
							<Button
								size="sm"
								variant="secondary"
								text="Switch"
								onPress={() => openAccountSwitcherSheet(api.jsonStorage)}
							/>
						}
					/>
					<TableRow
						label="Add Another Account"
						subLabel="Sign in with credentials, user token, or bot account"
						arrow
						onPress={() => openAddAccountSheet(api.jsonStorage)}
					/>
				</TableRowGroup>

				<TableRowGroup title={`SAVED ACCOUNTS (${accounts.length})`}>
					{accounts.length === 0 ? (
						<TableRow
							label="No Accounts Saved"
							subLabel="Tap 'Add Another Account' above or hold the YouBar tab to save accounts."
						/>
					) : (
						accounts.map((acc, index) => {
							const isCurrent = acc.id === currentUserId
							const avatarUrl = acc.avatar
								? `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.png?size=80`
								: 'https://cdn.discordapp.com/embed/avatars/0.png'

							const displayName = storage.enableCLI
								? `${acc.username}${acc.discriminator && acc.discriminator !== '0' ? `#${acc.discriminator}` : ''}`
								: acc.displayName || acc.username

							return (
								<TableRow
									key={acc.id}
									icon={
										<Image
											source={{ uri: avatarUrl }}
											style={{
												width: 36,
												height: 36,
												borderRadius: 18,
												borderWidth: isCurrent ? 2 : 0,
												borderColor: '#23a55a',
											}}
										/>
									}
									label={
										<View
											style={{
												flexDirection: 'row',
												alignItems: 'center',
												gap: 6,
											}}
										>
											<Text variant="text-md/semibold" color="text-default">
												{`${index + 1}. ${displayName}`}
											</Text>
											{acc.isBot && (
												<View
													style={{
														backgroundColor: '#5865f2',
														borderRadius: 4,
														paddingHorizontal: 5,
														paddingVertical: 1,
													}}
												>
													<Text
														style={{
															color: '#ffffff',
															fontSize: 9,
															fontWeight: 'bold',
														}}
													>
														BOT
													</Text>
												</View>
											)}
										</View>
									}
									subLabel={
										isCurrent
											? '✓ Active Account'
											: acc.isNative
												? 'Discord Account • Tap to switch'
												: `Added: ${formatDate(acc.addedAt)} • Tap to switch`
									}
									arrow={!isCurrent}
									onPress={() => handleAccountPress(acc)}
								/>
							)
						})
					)}
				</TableRowGroup>

				<TableRowGroup title="MULTI-ACCOUNT SETTINGS">
					<TableSwitchRow
						label="Native Account Switcher"
						subLabel="Automatically unlocks Discord's built-in multi-account switcher in the YouBar"
						value={storage.enableNativeSwitcher !== false}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ enableNativeSwitcher: v })
						}
					/>
					<TableSwitchRow
						label="Block Background Notifications"
						subLabel="Stop notifications from leaking from accounts you are not currently signed into"
						value={storage.blockOtherAccountNotifications !== false}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ blockOtherAccountNotifications: v })
						}
					/>
					<TableSwitchRow
						label="Persistent Storage Vault"
						subLabel="Protects accounts from clearing themselves on restart or cache wipes"
						value={storage.persistentStorageVault !== false}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ persistentStorageVault: v })
						}
					/>
					<TableSwitchRow
						label="Show Full Username Tag"
						subLabel="Display username#0000 discriminator in the accounts list"
						value={storage.enableCLI !== false}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ enableCLI: v })
						}
					/>
					<TableSwitchRow
						label="Confirm Before Removing"
						subLabel="Ask for confirmation before deleting an account from storage"
						value={storage.confirmBeforeDelete !== false}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ confirmBeforeDelete: v })
						}
					/>
					<TableSwitchRow
						label="Enable Unsafe Features"
						subLabel="Allow token copying and advanced account export"
						value={!!storage.enableUnsafeFeatures}
						onValueChange={(v: boolean) =>
							api.jsonStorage.set({ enableUnsafeFeatures: v })
						}
					/>
				</TableRowGroup>

				<TableRowGroup title="BACKUP & SESSIONS">
					<TableRow
						label="Export Accounts"
						subLabel="Copy all saved accounts and tokens to clipboard (JSON)"
						arrow
						onPress={handleExport}
					/>
					<TableRow
						label="Import Accounts from Clipboard"
						subLabel="Restore accounts from previously copied export JSON"
						arrow
						onPress={handleImport}
					/>
					<TableRow
						label="Force Logout Session"
						subLabel="Invalidate current session while preserving saved switcher accounts"
						arrow
						onPress={() => {
							Alert.alert(
								'Force Logout',
								'This will log you out of your current session. Your saved accounts will remain safe in the vault.',
								[
									{ text: 'Cancel', style: 'cancel' },
									{
										text: 'Force Logout',
										style: 'destructive',
										onPress: () => forceLogout(),
									},
								],
							)
						}}
					/>
				</TableRowGroup>
			</Stack>
		</ScrollView>
	)
}