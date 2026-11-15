import { Design } from '@valenced/discord/design'
import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { BEFORE_LOAD, USER_AGENT } from './script'
import { resolveWebView } from './webview'

const color = '#dbdee1'

// Login only: quests run in the background runner's hidden web view, which shares
// this web login.
export default function WebRunner({ onClose }: { onClose(): void }) {
	const WebView = useMemo(resolveWebView, [])
	const [error, setError] = useState('')
	return (
		<View style={{ flex: 1 }}>
			<View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
				<Design.Button text="Back" size="sm" onPress={onClose} />
			</View>
			<View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
				{!WebView && (
					<Text style={{ color }}>
						Android System WebView is unavailable on this device.
					</Text>
				)}
				<Text style={{ color }}>
					Log in to discord.com below, then press Back. Quests you accept run
					in the background while "Start background runner with Discord" is on.
				</Text>
				{!!error && <Text style={{ color: '#f23f43' }}>{error}</Text>}
			</View>
			{WebView && (
				<WebView
					source={{ uri: 'https://discord.com/quest-home' }}
					style={{ flex: 1 }}
					containerStyle={{ flex: 1 }}
					userAgent={USER_AGENT}
					injectedJavaScriptBeforeContentLoaded={BEFORE_LOAD}
					javaScriptEnabled
					domStorageEnabled
					sharedCookiesEnabled
					thirdPartyCookiesEnabled
					scalesPageToFit
					setBuiltInZoomControls
					setDisplayZoomControls={false}
					originWhitelist={['https://*']}
					onError={() => setError('Could not load discord.com.')}
				/>
			)}
		</View>
	)
}
