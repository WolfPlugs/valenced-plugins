import { useState } from 'react'
import {
	defaultAdjustment,
	orientRatio,
	originalAspectRatio,
} from './transforms'
import type { TransformCommand } from '../protocol'
import type { AngleAdjustment } from './transforms'

export function useCropControls(send: (command: TransformCommand) => void) {
	const [sourceRatio, setSourceRatio] = useState(1)
	const [cropRatio, setCropRatio] = useState<number | undefined>(undefined)
	const [landscape, setLandscape] = useState(false)
	const [rotation, setRotation] = useState(0)
	const [flipped, setFlipped] = useState(false)
	const [adjustment, setAdjustment] = useState(defaultAdjustment)
	const originalRatio = originalAspectRatio(sourceRatio, rotation)

	function initialize(width: number, height: number) {
		setSourceRatio(width / height)
		setLandscape(width > height)
	}
	function reset() {
		setCropRatio(undefined)
		setLandscape(sourceRatio > 1)
		setRotation(0)
		setFlipped(false)
		setAdjustment(defaultAdjustment())
	}
	function open() {
		send({ type: 'crop', ratio: cropRatio ?? originalRatio })
	}
	return {
		initialize,
		reset,
		open,
		panelProps: {
			ratio: cropRatio,
			landscape,
			flipped,
			originalRatio,
			adjustment,
			onRatio: (value: number | undefined) => {
				setCropRatio(value)
				send({
					type: 'crop',
					ratio: value ?? originalRatio,
				})
			},
			onOrientation: (value: boolean) => {
				setLandscape(value)
				if (cropRatio !== undefined && cropRatio > 0) {
					const ratio = orientRatio(cropRatio, value)
					setCropRatio(ratio)
					send({ type: 'crop', ratio })
				}
			},
			onFlip: () => {
				setFlipped(value => !value)
				send({ type: 'flip' })
			},
			onRotate: () => {
				const next = (rotation + 1) % 4
				setRotation(next)
				send({ type: 'rotate' })
				send({
					type: 'crop',
					ratio: cropRatio ?? originalAspectRatio(sourceRatio, next),
				})
			},
			onAdjustment: (value: AngleAdjustment) => {
				setAdjustment(value)
				send({ type: 'adjust-angle', ...value })
			},
		},
	}
}
