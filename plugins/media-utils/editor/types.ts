import type { ComponentType, Ref } from 'react'

export type WebHandle = { injectJavaScript(script: string): void }
export type EditorWebView = ComponentType<{
	ref?: Ref<WebHandle>
	source: { html: string }
	style: { flex: number; backgroundColor: string }
	containerStyle: { flex: number }
	javaScriptEnabled: boolean
	mediaPlaybackRequiresUserAction: boolean
	allowsInlineMediaPlayback: boolean
	originWhitelist: string[]
	onMessage(event: { nativeEvent: { data: string } }): void
	onError(): void
	onContentProcessDidTerminate(): void
}>
export type OverlayProps = {
	item: { uri: string; mimeType?: string }
	kind: 'image' | 'video'
	WebView: EditorWebView
	onEdit(item: unknown): void
	reportError(error: unknown): void
	isCurrent(): boolean
}

export type EditorTool = 'Trim' | 'Crop' | 'Sound' | 'Markup'
