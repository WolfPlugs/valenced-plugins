import { lookupModule } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'
import {
	ReactJSXRuntimeModuleId,
	ReactModuleId,
	ReactNativeModuleId,
} from '@valenced/react'
import { codegenNativeCommands } from 'react-native'
import type { ComponentType, Ref } from 'react'

export type WebHandle = { injectJavaScript(script: string): void }
export type RunnerWebView = ComponentType<{
	ref?: Ref<WebHandle>
	source: { uri: string }
	style: { flex: number }
	containerStyle: { flex: number }
	userAgent: string
	injectedJavaScriptBeforeContentLoaded: string
	javaScriptEnabled: boolean
	domStorageEnabled: boolean
	sharedCookiesEnabled: boolean
	thirdPartyCookiesEnabled: boolean
	scalesPageToFit: boolean
	setBuiltInZoomControls: boolean
	setDisplayZoomControls: boolean
	originWhitelist: string[]
	onMessage(event: { nativeEvent: { data: string } }): void
	onError(): void
}>

type WebView = RunnerWebView & { isFileUploadSupported: unknown }
export function resolveWebView(): RunnerWebView | undefined {
	const [loaded] = lookupModule(withProps<WebView>('isFileUploadSupported'))
	if (loaded) return loaded
	if (typeof codegenNativeCommands !== 'function') return
	const react = ReactModuleId
	const native = ReactNativeModuleId
	const jsx = ReactJSXRuntimeModuleId
	const [, commands] = lookupModule(withName('codegenNativeCommands'))
	if (
		react === undefined ||
		native === undefined ||
		jsx === undefined ||
		commands === undefined
	)
		return
	const { relative } = withDependencies
	const [module] = lookupModule(
		withDependencies<{ default?: WebView }>([
			react,
			native,
			jsx,
			commands,
			relative(1),
			null,
			null,
			relative(3),
			relative(4),
		]),
		{ returnNamespace: true },
	)
	const view = module?.default
	return view && 'isFileUploadSupported' in view ? view : undefined
}
