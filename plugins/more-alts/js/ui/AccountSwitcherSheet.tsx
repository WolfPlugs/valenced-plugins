import type { JsonStorage } from '@valenced/json-storage'
import type { MoreAltsStorage, Account } from '../lib/types'
import {
	getCurrentUser,
	getAllAccounts,
	switchToAccount,
} from '../lib/accountActions'
import { openAddAccountSheet } from './Settings'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

export function openAccountSwitcherSheet(
	storage: JsonStorage<MoreAltsStorage>,
) {
	const rev = getValenced()
	const actions = rev.discord.actions.ActionSheetActionCreators
	if (!actions?.openLazy) return

	actions.openLazy(
		Promise.resolve({
			default: () => {
				const React: typeof import('react') = rev.react.React
				const { View, ScrollView, Image } = rev.react.ReactNative
				const {
					ActionSheet,
					BottomSheetTitleHeader,
					ActionSheetCloseButton,
					TableRowGroup,
					TableRow,
					Stack,
					Button,
					Text,
				} = rev.discord.design.Design as any

				const [loadingToken, setLoadingToken] = React.useState<string | null>(
					null,
				)
				const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

				const cached = storage.cache ?? ({} as any)
				const currentUser = getCurrentUser()
				const currentUserId = currentUser?.id
				const accounts = getAllAccounts(storage)

				const handleSwitch = async (account: Account) => {
					if (account.id === currentUserId) return
					const target = account.token || account.id
					setLoadingToken(target)
					const ok = await switchToAccount(target, account.isNative)
					setLoadingToken(null)
					if (ok) {
						actions.hideActionSheet()
					}
				}

				return (
					<ActionSheet
						header={
							<BottomSheetTitleHeader
								title="Switch Account"
								subtitle="Select an account to switch to"
								trailing={
									<ActionSheetCloseButton
										onPress={() => actions.hideActionSheet()}
									/>
								}
							/>
						}
					>
						<ScrollView
							contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
							keyboardShouldPersistTaps="handled"
						>
							<Stack spacing={16}>
								<TableRowGroup title={`Accounts (${accounts.length})`}>
									{accounts.length === 0 ? (
										<TableRow
											label="No Saved Accounts"
											subLabel="Tap '+ Add Account' below to save accounts for quick switching."
										/>
									) : (
										accounts.map(acc => {
											const isCurrent = acc.id === currentUserId
											const target = acc.token || acc.id
											const isLoading = loadingToken === target
											const avatarUrl = acc.avatar
												? `https://cdn.discordapp.com/avatars/${acc.id}/${acc.avatar}.png?size=80`
												: 'https://cdn.discordapp.com/embed/avatars/0.png'

											const displayName =
												cached.enableCLI !== false
													? `${acc.username}${acc.discriminator && acc.discriminator !== '0' ? `#${acc.discriminator}` : ''}`
													: acc.displayName || acc.username

											return (
												<TableRow
													key={acc.id}
													icon={
														<Image
															source={{ uri: avatarUrl }}
															style={{
																width: 40,
																height: 40,
																borderRadius: 20,
																borderWidth: isCurrent ? 2 : 0,
																borderColor: '#23A55A',
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
															<Text variant="text-md/semibold">
																{displayName}
															</Text>
															{acc.isBot && (
																<View
																	style={{
																		backgroundColor: '#5865F2',
																		borderRadius: 4,
																		paddingHorizontal: 5,
																		paddingVertical: 1,
																	}}
																>
																	<Text
																		style={{
																			color: '#FFFFFF',
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
																? 'Discord Account'
																: `@${acc.username}`
													}
													onPress={
														isCurrent || !!loadingToken
															? undefined
															: () => handleSwitch(acc)
													}
													trailing={
														isLoading ? (
															<Text variant="text-sm/normal" color="text-muted">
																Switching...
															</Text>
														) : null
													}
												/>
											)
										})
									)}
								</TableRowGroup>

								<View style={{ flexDirection: 'row', gap: 8 }}>
									<Button
										variant="secondary"
										text="+ Add Account"
										style={{ flex: 1 }}
										onPress={() => {
											actions.hideActionSheet()
											setTimeout(() => {
												openAddAccountSheet(storage, forceUpdate)
											}, 200)
										}}
									/>
								</View>
							</Stack>
						</ScrollView>
					</ActionSheet>
				)
			},
		}),
		'more-alts-quick-switcher',
		{},
	)
}
