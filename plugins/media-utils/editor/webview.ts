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
import type { EditorWebView } from './overlay-sheet'

type WebView = EditorWebView & { isFileUploadSupported: unknown }
export function resolveWebView(): EditorWebView | undefined {
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
