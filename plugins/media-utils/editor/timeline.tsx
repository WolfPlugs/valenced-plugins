import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import { Image, PanResponder, View } from 'react-native'
import { precisionTrimWindow, trimHandleTime } from './trim-range'

export function Timeline({
	duration,
	start,
	end,
	position,
	frames,
	onTrim,
	onSeek,
}: {
	duration: number
	start: number
	end: number
	position: number
	frames: string[]
	onTrim(start: number, end: number): void
	onSeek(time: number): void
}) {
	const [width, setWidth] = useState(1)
	const latest = useRef({ duration, start, end, width, onTrim })
	latest.current = { duration, start, end, width, onTrim }
	const origin = useRef(0)
	const delta = useRef(0)
	const baseline = useRef(0)
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const [zoom, setZoom] = useState<{ from: number; span: number } | null>(null)
	const viewport = useRef(zoom)
	function finish() {
		clearTimeout(timer.current)
		timer.current = undefined
		viewport.current = null
		setZoom(null)
	}
	useEffect(() => () => clearTimeout(timer.current), [])
	function handle(edge: 'start' | 'end') {
		return PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				origin.current = latest.current[edge]
				delta.current = 0
				baseline.current = 0
				clearTimeout(timer.current)
				timer.current = setTimeout(() => {
					const current = latest.current
					const next = precisionTrimWindow(
						current.duration,
						current[edge],
						edge,
					)
					origin.current = current[edge]
					baseline.current = delta.current
					viewport.current = next
					setZoom(next)
				}, 400)
			},
			onPanResponderMove: (_, gesture) => {
				const current = latest.current
				delta.current = gesture.dx
				const time = trimHandleTime(
					origin.current,
					gesture.dx - baseline.current,
					current.width,
					viewport.current?.span ?? current.duration,
				)
				const gap = Math.min(0.1, current.duration)
				if (edge === 'start')
					current.onTrim(
						Math.max(0, Math.min(time, current.end - gap)),
						current.end,
					)
				else
					current.onTrim(
						current.start,
						Math.min(current.duration, Math.max(time, current.start + gap)),
					)
			},
			onPanResponderRelease: finish,
			onPanResponderTerminate: finish,
			onPanResponderTerminationRequest: () => true,
		}).panHandlers
	}
	const [left] = useState(() => handle('start'))
	const [right] = useState(() => handle('end'))
	const fraction = (time: number) =>
		Math.max(
			0,
			Math.min(1, (time - (zoom?.from ?? 0)) / (zoom?.span || duration || 1)),
		)
	return (
		<View style={{ gap: 8, paddingHorizontal: 12 }}>
			<View
				style={{ height: 56, marginHorizontal: 12 }}
				onLayout={event => setWidth(event.nativeEvent.layout.width)}
			>
				<View
					style={{
						flexDirection: 'row',
						height: 56,
						overflow: 'hidden',
						borderRadius: 8,
						backgroundColor: '#303136',
					}}
					onStartShouldSetResponder={() => true}
					onResponderRelease={event =>
						onSeek(
							Math.max(
								0,
								Math.min(
									duration,
									(zoom?.from ?? 0) +
										(event.nativeEvent.locationX / width) *
											(zoom?.span ?? duration),
								),
							),
						)
					}
				>
					<View
						pointerEvents="none"
						style={{
							flexDirection: 'row',
							position: 'absolute',
							height: 56,
							width: (width * duration) / (zoom?.span || duration || 1),
							left:
								(-(zoom?.from ?? 0) / (zoom?.span || duration || 1)) * width,
						}}
					>
						{frames.map((uri, index) => (
							<Image
								key={index}
								source={{ uri }}
								style={{ flex: 1, height: 56 }}
								resizeMode="cover"
							/>
						))}
					</View>
				</View>
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						bottom: 0,
						width: fraction(start) * width,
						backgroundColor: '#00000099',
					}}
				/>
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						right: 0,
						top: 0,
						bottom: 0,
						width: (1 - fraction(end)) * width,
						backgroundColor: '#00000099',
					}}
				/>
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						top: 0,
						bottom: 0,
						left: fraction(start) * width,
						width: (fraction(end) - fraction(start)) * width,
						borderTopWidth: 2,
						borderBottomWidth: 2,
						borderColor: '#ffffff',
					}}
				/>
				<View
					pointerEvents="none"
					style={{
						position: 'absolute',
						top: -4,
						bottom: -4,
						width: 2,
						backgroundColor: '#ffffff',
						left: fraction(position) * width,
					}}
				/>
				{(
					[
						{ edge: 'start', time: start, handlers: left },
						{ edge: 'end', time: end, handlers: right },
					] as const
				).map(({ edge, time, handlers }) => (
					<View
						key={edge}
						{...handlers}
						accessible
						accessibilityRole="adjustable"
						accessibilityLabel={`${edge} of clip`}
						accessibilityValue={{ min: 0, max: duration, now: time }}
						accessibilityActions={[
							{ name: 'increment' },
							{ name: 'decrement' },
						]}
						onAccessibilityAction={event => {
							const time =
								(edge === 'start' ? start : end) +
								(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)
							if (edge === 'start')
								onTrim(
									Math.max(0, Math.min(time, end - Math.min(0.1, duration))),
									end,
								)
							else
								onTrim(
									start,
									Math.min(
										duration,
										Math.max(time, start + Math.min(0.1, duration)),
									),
								)
						}}
						style={{
							position: 'absolute',
							left: fraction(time) * width - 12,
							top: -4,
							width: 24,
							height: 64,
							borderRadius: 6,
							backgroundColor: '#ffffff',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<View
							style={{
								width: 3,
								height: 20,
								backgroundColor: '#111214',
								borderRadius: 2,
							}}
						/>
					</View>
				))}
			</View>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
				<Design.Text style={{ color: '#b5bac1' }}>
					{start.toFixed(zoom ? 2 : 1)}s
				</Design.Text>
				{zoom && (
					<Design.Text style={{ color: '#ffffff' }}>Precision trim</Design.Text>
				)}
				<Design.Text style={{ color: '#b5bac1' }}>
					{end.toFixed(zoom ? 2 : 1)}s
				</Design.Text>
			</View>
		</View>
	)
}
