import type { AngleAdjustment } from './shared/transforms'

// Commands supported by both image and video transforms.
export type TransformCommand =
	| { type: 'crop'; ratio?: number }
	| { type: 'reset-crop' | 'rotate' | 'flip' }
	| ({ type: 'adjust-angle' } & AngleAdjustment)

// Playback, timeline, and audio commands belong to the video editor.
type VideoCommand =
	| { type: 'audio'; volume: number; musicVolume: number }
	| { type: 'soundtrack'; data: string | null; mime?: string }
	| { type: 'seek'; time: number }
	| { type: 'preview' }
	| {
			type: 'thumbnails'
			from: number
			span: number
			count: number
			id: number
	  }
	| { type: 'trim'; start: number; end: number; previewTime?: number }

// The React Native shell sends these to the embedded browser runtime.
export type CanvasCommand =
	| TransformCommand
	| VideoCommand
	| { type: 'load'; data: string; kind: 'image' | 'video'; mime: string }
	| { type: 'tool'; draw: boolean; color: string; size: number }
	| { type: 'text'; text: string; color: string; size: number }
	| { type: 'emoji'; data: string }
	| { type: 'undo' | 'revert' | 'export' | 'cancel' }
