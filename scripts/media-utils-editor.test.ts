import { beforeEach, expect, mock, test } from 'bun:test'
import { Children, createElement, isValidElement } from 'react'
import type { ReactNode } from 'react'

const Group = () => null
const Row = () => null
const Icon = () => null
const WebView = Object.assign(() => null, {
	isFileUploadSupported: Promise.resolve(true),
})
type Patch = (args: unknown[], original: () => unknown) => ReactNode
let patch: Patch
let available = true
let initialized = false
let opened: unknown[] = []
let nativeEdits = 0
const errors: unknown[] = []
mock.module('@valenced/discord/actions', () => ({
	ActionSheetActionCreators: {
		hideActionSheet() {},
		openLazy: (...args: unknown[]) => {
			opened = args
		},
	},
}))
mock.module('@valenced/react', () => ({
	ReactModuleId: 19,
	ReactNativeModuleId: 17,
	ReactJSXRuntimeModuleId: 21,
}))
mock.module('@valenced/modules/native', () => ({
	callNativeMethod: async () => true,
}))
mock.module('@valenced/discord/native', () => ({ FileModule: {} }))
mock.module('@valenced/externals/react-native-safe-area-context', () => ({
	ReactNativeSafeAreaContext: {
		SafeAreaProvider: () => null,
		SafeAreaView: () => null,
	},
}))
mock.module('@valenced/utils/discord', () => ({
	lookupGeneratedIconComponent: () => Icon,
}))
mock.module('@valenced/discord/design', () => ({
	Design: { TableRowGroup: Group, TableRow: Row },
}))
mock.module('@valenced/modules/finders/filters', () => ({
	withName: (name: string) => name,
	withProps: (...props: string[]) => props.join('+'),
	withDependencies: Object.assign((deps: unknown[]) => ({ deps }), {
		relative: (offset: number) => ({ offset }),
	}),
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule: (filter: unknown) => {
		if (filter === 'isFileUploadSupported')
			return initialized ? [WebView, 999] : []
		if (filter === 'createElement+useState') return [{}, 20]
		if (filter === 'View+NativeModules') return [{}, 17]
		if (filter === 'jsx+jsxs') return [{}, 22]
		if (filter === 'codegenNativeCommands') return [{}, 113]
		if (typeof filter === 'object' && filter !== null && 'deps' in filter) {
			expect(filter.deps).toEqual([
				19,
				17,
				21,
				113,
				{ offset: 1 },
				null,
				null,
				{ offset: 3 },
				{ offset: 4 },
			])
			const actualDependencies = [19, 17, 21, 113, 7885, 39, 38, 7887, 7888]
			if (
				!Array.isArray(filter.deps) ||
				filter.deps.length !== actualDependencies.length ||
				!filter.deps.every(
					(entry: unknown, index: number) =>
						entry === null ||
						(typeof entry === 'number'
							? entry === actualDependencies[index]
							: typeof entry === 'object' &&
								entry !== null &&
								'offset' in entry &&
								typeof entry.offset === 'number' &&
								7884 + entry.offset === actualDependencies[index]),
				)
			)
				return []
			initialized = true
			return [{ default: WebView }, 999]
		}
		return []
	},
	getModules: (filter: string, callback: (module: unknown) => void) => {
		if (filter === 'isFileUploadSupported') {
			if (available) callback(WebView)
		} else if (filter === 'UploadPreviewActionSheet') callback({ default() {} })
		return () => {}
	},
}))
mock.module('@valenced/patcher', () => ({
	instead: (_target: unknown, _key: string, callback: Patch) => {
		patch = callback
		return () => {}
	},
}))
mock.module('react-native', () => ({
	Image: () => null,
	KeyboardAvoidingView: () => null,
	Modal: () => null,
	PanResponder: { create: () => ({ panHandlers: {} }) },
	ScrollView: () => null,
	View: () => null,
	codegenNativeCommands() {},
}))
const { patchImageEditor } = await import('../plugins/media-utils/editor/index')

function rows(video: boolean, includeEdit = true) {
	const props = {
		upload: {
			isVideo: video,
			isImage: !video,
			item: { uri: 'file:///source' },
		},
		onEdit() {},
	}
	const original = createElement(
		'sheet',
		{},
		createElement(Group, {}, [
			createElement(Row, {
				key: 'description',
				label: 'Add description',
				arrow: true,
			}),
			...(!video && includeEdit
				? [
						createElement(Row, {
							key: 'edit',
							label: 'Edit image',
							onPress: () => {
								nativeEdits++
							},
							arrow: true,
							icon: createElement(Icon),
						}),
					]
				: []),
		]),
	)
	const result = patch([props], () => original)
	if (!isValidElement<{ children: ReactNode }>(result))
		throw Error('Invalid sheet')
	const group = Children.toArray(result.props.children)[0]
	if (!isValidElement<{ children: ReactNode }>(group))
		throw Error('Invalid group')
	return Children.toArray(group.props.children).map(row => {
		if (!isValidElement<{ label: string; onPress(): void }>(row))
			throw Error('Invalid row')
		return row.props
	})
}
beforeEach(() => {
	available = true
	initialized = false
	opened = []
	errors.length = 0
})
test('preserves the native image editor instead of opening a replacement drawer', async () => {
	patchImageEditor(
		() => {},
		error => errors.push(error),
	)
	const actions = rows(false)
	expect(actions.map(row => row.label)).toEqual([
		'Add description',
		'Edit image',
	])
	actions[1].onPress()
	await new Promise(resolve => setTimeout(resolve, 0))
	expect(nativeEdits).toBe(1)
	expect(opened).toEqual([])
})
test('loads the lazy video backend through its dependency fingerprint', () => {
	available = false
	patchImageEditor(
		() => {},
		error => errors.push(error),
	)
	const actions = rows(true)
	expect(actions.map(row => row.label)).toEqual([
		'Add description',
		'Edit video',
	])
	actions[1].onPress()
	expect(initialized).toBe(true)
	expect(opened[2]).toHaveProperty('kind', 'video')
	expect(errors).toHaveLength(0)
})
test('does not replace Add description when the native image edit row is absent', () => {
	patchImageEditor(
		() => {},
		error => errors.push(error),
	)
	expect(rows(false, false).map(row => row.label)).toEqual(['Add description'])
})
