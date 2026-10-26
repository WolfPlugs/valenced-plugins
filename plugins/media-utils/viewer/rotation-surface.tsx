import {
	cloneElement,
	isValidElement,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react'
import {
	Animated,
	View as NativeView,
	PanResponder,
	StyleSheet,
} from 'react-native'
import { readSettings } from '../settings/config'
import FullResolution from './full-resolution'
import { initialTransform, moveImage } from './touch-transform'
import { maximumImageZoom } from './zoom'
import type { ElementRef, ReactElement, ReactNode, Ref } from 'react'
import type { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native'
import type { SettingsStore } from '../settings/config'
import type { TouchPoint } from './touch-transform'

type ZoomHandle = {
	zoomTo(point: { x: number; y: number }): void
	unzoom(): void
}
type ViewerProps = {
	children?: ReactNode
	style?: StyleProp<ViewStyle>
	ref?: Ref<ZoomHandle>
	maximumZoomScale?: number
	onZoomChanged?: (event: { nativeEvent: { zoomScale: number } }) => void
}
const resets = new Set<() => void>()
export function resetRotations() {
	for (const reset of resets) reset()
}

export default function RotationSurface({
	viewer,
	reportError,
	store,
	kind,
}: {
	store: SettingsStore
	kind: 'image' | 'video'
	reportError: (error: unknown) => void
	viewer: ReactElement<ViewerProps>
}) {
	const settings = readSettings(store.use())
	const preferences = useRef(settings)
	preferences.current = settings
	const [active, setActive] = useState(true)
	const [zoomed, setZoomed] = useState(false)
	const enabled = useRef(true)
	const viewport = useRef<ElementRef<typeof NativeView>>(null)
	const center = useRef({ x: 0, y: 0 })
	const measureViewport = () =>
		viewport.current?.measureInWindow((left, top, width, height) => {
			center.current = { x: left + width / 2, y: top + height / 2 }
		})
	const transform = useRef(initialTransform())
	const previous = useRef<readonly TouchPoint[]>([])
	const rotation = useRef(new Animated.Value(0)).current
	const scale = useRef(new Animated.Value(1)).current
	const x = useRef(new Animated.Value(0)).current
	const y = useRef(new Animated.Value(0)).current
	const reportedZoom = useRef(false)
	const props = useRef(viewer.props)
	props.current = viewer.props
	const detector = viewer.props.children
	const supported = isValidElement<{ children?: ReactNode }>(detector)
	const apply = () => {
		const value = transform.current
		rotation.setValue(value.rotation)
		scale.setValue(value.scale)
		x.setValue(value.x)
		y.setValue(value.y)
		const zoomed = value.scale > 1
		if (zoomed !== reportedZoom.current) {
			reportedZoom.current = zoomed
			setZoomed(zoomed)
			props.current.onZoomChanged?.({ nativeEvent: { zoomScale: value.scale } })
		}
	}
	const resetTransform = () => {
		previous.current = []
		transform.current = initialTransform()
		apply()
	}
	useImperativeHandle(viewer.props.ref, () => ({
		zoomTo(point) {
			if (!preferences.current.zoomEnabled) return
			const zoomScale = preferences.current.doubleTapZoom
			previous.current = []
			const zoom = (
				left: number,
				top: number,
				width: number,
				height: number,
			) => {
				if (!enabled.current) return
				center.current = { x: left + width / 2, y: top + height / 2 }
				transform.current = {
					...transform.current,
					scale: zoomScale,
					x:
						width > 0
							? (width / 2 - Math.max(0, Math.min(width, point.x - left))) *
								(zoomScale - 1)
							: 0,
					y:
						height > 0
							? (height / 2 - Math.max(0, Math.min(height, point.y - top))) *
								(zoomScale - 1)
							: 0,
				}
				apply()
			}
			if (viewport.current) viewport.current.measureInWindow(zoom)
			else zoom(0, 0, 0, 0)
		},
		unzoom: resetTransform,
	}))
	const responder = useMemo(() => {
		const canRotate = () =>
			kind === 'video'
				? preferences.current.rotateVideos
				: preferences.current.rotateImages
		const canInteract = () => canRotate() || preferences.current.zoomEnabled
		const capture = (event: GestureResponderEvent) =>
			enabled.current &&
			canInteract() &&
			(event.nativeEvent.touches.length >= 2 || transform.current.scale > 1)
		const remember = (event: GestureResponderEvent) => {
			previous.current = event.nativeEvent.touches.map(touch => ({
				identifier: touch.identifier,
				pageX: touch.pageX,
				pageY: touch.pageY,
			}))
		}
		return PanResponder.create({
			onStartShouldSetPanResponderCapture: event =>
				enabled.current &&
				canInteract() &&
				event.nativeEvent.touches.length >= 2,
			onMoveShouldSetPanResponderCapture: (event, gesture) =>
				capture(event) &&
				(event.nativeEvent.touches.length >= 2 ||
					Math.hypot(gesture.dx, gesture.dy) > 3),
			onPanResponderGrant(event) {
				measureViewport()
				remember(event)
			},
			onPanResponderMove(event) {
				if (!enabled.current) return
				const touches = event.nativeEvent.touches
				const next = moveImage(
					transform.current,
					previous.current,
					touches,
					maximumImageZoom,
					center.current,
				)
				transform.current = {
					...next,
					rotation: canRotate() ? next.rotation : 0,
					scale: preferences.current.zoomEnabled ? next.scale : 1,
					x: preferences.current.zoomEnabled ? next.x : 0,
					y: preferences.current.zoomEnabled ? next.y : 0,
				}
				remember(event)
				apply()
			},
			onPanResponderRelease() {
				previous.current = []
			},
			onPanResponderTerminate() {
				previous.current = []
			},
			onPanResponderTerminationRequest: () => false,
			onShouldBlockNativeResponder: () => true,
		})
	}, [rotation, scale, x, y])
	useEffect(() => {
		const reset = () => {
			enabled.current = false
			transform.current = initialTransform()
			apply()
			setActive(false)
		}
		resets.add(reset)
		return () => {
			resets.delete(reset)
		}
	}, [])
	useEffect(() => {
		if (!(kind === 'video' ? settings.rotateVideos : settings.rotateImages))
			transform.current.rotation = 0
		if (!settings.zoomEnabled) {
			transform.current.scale = 1
			transform.current.x = 0
			transform.current.y = 0
		}
		apply()
	}, [kind, settings.rotateImages, settings.rotateVideos, settings.zoomEnabled])
	if (!active || !supported) return viewer
	return (
		<NativeView
			ref={viewport}
			onLayout={measureViewport}
			collapsable={false}
			style={viewer.props.style}
			{...responder.panHandlers}
		>
			{cloneElement(
				detector,
				{},
				<Animated.View
					collapsable={false}
					style={[
						StyleSheet.absoluteFill,
						{
							transform: [
								{ translateX: x },
								{ translateY: y },
								{ scale },
								{
									rotate: rotation.interpolate({
										inputRange: [-Math.PI, Math.PI],
										outputRange: ['-180deg', '180deg'],
										extrapolate: 'extend',
									}),
								},
							],
						},
					]}
				>
					<FullResolution
						zoomed={zoomed && settings.fullResolution && kind === 'image'}
						enabled={settings.fullResolution && kind === 'image'}
						reportError={reportError}
					>
						{detector.props.children}
					</FullResolution>
				</Animated.View>,
			)}
		</NativeView>
	)
}
