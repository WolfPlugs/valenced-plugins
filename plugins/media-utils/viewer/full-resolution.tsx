import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import {
	Children,
	cloneElement,
	isValidElement,
	useEffect,
	useState,
} from 'react'
import {
	Image as NativeImage,
	View as NativeView,
	StyleSheet,
} from 'react-native'
import { readImageSource } from '../utils/media'
import type { ReactNode } from 'react'

export function originalImageSource(value: unknown) {
	if (Array.isArray(value)) value = value[value.length - 1]
	const image = readImageSource(value)
	if (!image || typeof value !== 'object' || value === null) return
	let uri = image.searchUri
	if (
		/^https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[^.]+\.discordapp\.net)\//i.test(
			uri,
		)
	) {
		const hashIndex = uri.indexOf('#')
		const hash = hashIndex < 0 ? '' : uri.slice(hashIndex)
		const base = hashIndex < 0 ? uri : uri.slice(0, hashIndex)
		const queryIndex = base.indexOf('?')
		if (queryIndex >= 0) {
			const query = base
				.slice(queryIndex + 1)
				.split('&')
				.filter(param => !/^(?:width|height|quality|format)=/i.test(param))
				.join('&')
			uri = base.slice(0, queryIndex) + (query ? `?${query}` : '') + hash
		}
	}
	return { ...value, uri }
}

const originals = new Map<string, number>()

export function retainOriginalImage(uri: string) {
	originals.set(uri, (originals.get(uri) ?? 0) + 1)
	return () => {
		const count = originals.get(uri) ?? 0
		if (count <= 1) originals.delete(uri)
		else originals.set(uri, count - 1)
	}
}

export function renderOriginalImage(node: ReactNode): ReactNode {
	if (
		!isValidElement<{
			source?: unknown
			children?: ReactNode
			resizeMethod?: string
		}>(node)
	)
		return node
	const source = node.props.source
	const original =
		typeof source === 'object' &&
		source !== null &&
		'uri' in source &&
		typeof source.uri === 'string' &&
		originals.has(source.uri)
	const children = node.props.children
	if (children === undefined)
		return original ? cloneElement(node, { resizeMethod: 'none' }) : node
	return cloneElement(
		node,
		original ? { resizeMethod: 'none' } : {},
		Children.map(children, renderOriginalImage),
	)
}

export function patchNativeResolution(cleanup: (callback: () => void) => void) {
	cleanup(() => originals.clear())
	cleanup(
		getModules(
			withProps<{ type: (...args: unknown[]) => ReactNode }>('type'),
			module => {
				if (
					typeof module.type !== 'function' ||
					module.type.name !== 'MediaModalImage'
				)
					return
				cleanup(
					instead(module, 'type', function (args, original) {
						return renderOriginalImage(Reflect.apply(original, this, args))
					}),
				)
			},
			{ max: Infinity },
		),
	)
}

type PresenterProps = {
	source?: unknown
	renderMedia?: (...args: unknown[]) => unknown
}

export default function FullResolution({
	children,
	zoomed,
	enabled = true,
	reportError,
}: {
	children: ReactNode
	zoomed: boolean
	enabled?: boolean
	reportError: (error: unknown) => void
}) {
	const [requested, setRequested] = useState(false)
	const [loaded, setLoaded] = useState(false)
	const [failed, setFailed] = useState(false)
	const [decoded, setDecoded] = useState(false)
	const presenter = isValidElement<PresenterProps>(children)
		? children
		: undefined
	const source = originalImageSource(presenter?.props.source)
	const uri = source?.uri
	useEffect(() => {
		if (enabled && zoomed) setRequested(true)
	}, [zoomed, enabled])
	useEffect(() => {
		if (!enabled || !requested || !uri) return
		let cancelled = false
		NativeImage.prefetch(uri)
			.then(success => {
				if (cancelled) return
				if (success) setLoaded(true)
				else {
					setFailed(true)
					reportError(
						new Error('MediaUtils: original image could not be loaded.'),
					)
				}
			})
			.catch(error => {
				if (!cancelled) {
					setFailed(true)
					reportError(error)
				}
			})
		return () => {
			cancelled = true
		}
	}, [enabled, requested, uri, reportError])
	useEffect(() => {
		if (enabled && requested && !failed && uri) return retainOriginalImage(uri)
	}, [enabled, requested, failed, uri])
	const renderMedia = presenter?.props.renderMedia
	if (!enabled || !presenter || !source || typeof renderMedia !== 'function')
		return children
	return cloneElement(presenter, {
		renderMedia: function (...args) {
			const result = Reflect.apply(renderMedia, this, args)
			if (
				!isValidElement<{
					resizeMethod?: string
					source?: unknown
					onLoadStart?: () => void
					onLoad?: () => void
					onError?: (error: unknown) => void
				}>(result)
			)
				return result
			return (
				<NativeView style={StyleSheet.absoluteFill}>
					{(!decoded || failed) && (
						<NativeView key="preview" style={StyleSheet.absoluteFill}>
							{result}
						</NativeView>
					)}
					{loaded && !failed && (
						<NativeView
							key="original"
							pointerEvents={decoded ? 'auto' : 'none'}
							style={[StyleSheet.absoluteFill, { opacity: decoded ? 1 : 0 }]}
						>
							{cloneElement(result, {
								source,
								resizeMethod: 'none',
								onLoadStart: undefined,
								onLoad: () => setDecoded(true),
								onError: error => {
									setFailed(true)
									reportError(error)
								},
							})}
						</NativeView>
					)}
				</NativeView>
			)
		},
	})
}
