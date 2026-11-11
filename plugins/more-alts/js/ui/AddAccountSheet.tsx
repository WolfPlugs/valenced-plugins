import {
	addCurrentAccount,
	addAccountWithToken,
	addAccountWithCredentials,
} from '../lib/accountActions'

function getValenced(): any {
	try {
		if (typeof valenced !== 'undefined') return valenced
	} catch {}
	return (globalThis as any).valenced
}

export function openAddAccountSheet(
	storage: any,
	onDone?: () => void,
) {
	const rev = getValenced()
	const actions = rev?.discord?.actions?.ActionSheetActionCreators
	if (!actions?.openLazy) return

	actions.openLazy(
		Promise.resolve({
			default: () => {
				const React: typeof import('react') = rev.react.React
				const { View, ScrollView } = rev.react.ReactNative
				const {
					ActionSheet,
					BottomSheetTitleHeader,
					ActionSheetCloseButton,
					TableRowGroup,
					TableRow,
					Stack,
					Button,
					Text,
					TextInput,
				} = rev.discord.design.Design as any

				const [mode, setMode] = React.useState<'choose' | 'credentials' | 'token'>('choose')
				const [email, setEmail] = React.useState('')
				const [password, setPassword] = React.useState('')
				const [token, setToken] = React.useState('')
				const [statusMsg, setStatusMsg] = React.useState<string | null>(null)
				const [loading, setLoading] = React.useState(false)

				const handleAddCurrent = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addCurrentAccount(storage)
					setLoading(false)
					if (res.success) {
						onDone?.()
						actions.hideActionSheet()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handleAddCredentials = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addAccountWithCredentials(storage, email, password)
					setLoading(false)
					if (res.success) {
						onDone?.()
						actions.hideActionSheet()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handleAddToken = async () => {
					setLoading(true)
					setStatusMsg(null)
					const res = await addAccountWithToken(storage, token)
					setLoading(false)
					if (res.success) {
						onDone?.()
						actions.hideActionSheet()
					} else {
						setStatusMsg(res.message)
					}
				}

				const handlePasteToken = async () => {
					try {
						const clip = rev.discord?.common?.Clipboard ?? rev.externals?.ReactNativeClipboard
						if (clip?.getString) {
							const text = await clip.getString()
							if (text) setToken(text.trim())
						}
					} catch {}
				}

				return (
					<ActionSheet>
						<BottomSheetTitleHeader
							title="Add Account"
							trailing={
								<ActionSheetCloseButton
									onPress={() => actions.hideActionSheet()}
								/>
							}
						/>
						<ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 16 }}>
							<Stack spacing={16}>
								{statusMsg && (
									<View
										style={{
											backgroundColor: 'rgba(237, 66, 69, 0.15)',
											borderRadius: 8,
											padding: 12,
											borderWidth: 1,
											borderColor: 'rgba(237, 66, 69, 0.4)',
										}}
									>
										<Text variant="text-sm/medium" color="text-danger">
											{statusMsg}
										</Text>
									</View>
								)}

								{mode === 'choose' && (
									<>
										<TableRowGroup title="CURRENT SESSION">
											<TableRow
												label="Save Currently Logged-in Account"
												subLabel="Adds the active account to your switcher vault"
												onPress={handleAddCurrent}
												disabled={loading}
												arrow
											/>
										</TableRowGroup>

										<TableRowGroup title="NEW ACCOUNT">
											<TableRow
												label="Sign in with Email & Password"
												subLabel="Log in with Discord credentials directly"
												onPress={() => {
													setStatusMsg(null)
													setMode('credentials')
												}}
												arrow
											/>
											<TableRow
												label="Add with Token"
												subLabel="Paste a Discord user or bot token"
												onPress={() => {
													setStatusMsg(null)
													setMode('token')
												}}
												arrow
											/>
										</TableRowGroup>
									</>
								)}

								{mode === 'credentials' && (
									<>
										<TableRowGroup title="DISCORD CREDENTIALS">
											<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
												<TextInput
													label="Email or Phone"
													value={email}
													onChange={(t: string) => setEmail(t)}
													placeholder="user@example.com"
													keyboardType="email-address"
													editable={!loading}
												/>
												<TextInput
													label="Password"
													value={password}
													onChange={(t: string) => setPassword(t)}
													placeholder="••••••••••••"
													secureTextEntry
													editable={!loading}
												/>
											</View>
										</TableRowGroup>

										<View style={{ flexDirection: 'row', gap: 10 }}>
											<Button
												variant="secondary"
												text="Back"
												onPress={() => setMode('choose')}
												style={{ flex: 1 }}
											/>
											<Button
												variant="primary"
												text={loading ? 'Logging in...' : 'Sign In'}
												onPress={handleAddCredentials}
												disabled={loading || !email.trim() || !password.trim()}
												style={{ flex: 2 }}
											/>
										</View>
									</>
								)}

								{mode === 'token' && (
									<>
										<TableRowGroup title="AUTHENTICATION TOKEN">
											<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
												<TextInput
													label="Discord Token"
													value={token}
													onChange={(t: string) => setToken(t)}
													placeholder="Paste user or bot token..."
													secureTextEntry
													editable={!loading}
												/>
												<Button
													size="sm"
													variant="secondary"
													text="Paste from Clipboard"
													onPress={handlePasteToken}
												/>
											</View>
										</TableRowGroup>

										<View style={{ flexDirection: 'row', gap: 10 }}>
											<Button
												variant="secondary"
												text="Back"
												onPress={() => setMode('choose')}
												style={{ flex: 1 }}
											/>
											<Button
												variant="primary"
												text={loading ? 'Adding...' : 'Add Account'}
												onPress={handleAddToken}
												disabled={loading || !token.trim()}
												style={{ flex: 2 }}
											/>
										</View>
									</>
								)}
							</Stack>
						</ScrollView>
					</ActionSheet>
				)
			},
		}),
		'more-alts-add-account',
		{},
	)
}