export type Brush = 'pen' | 'highlighter' | 'mosaic' | 'eraser'
export type TextStyle = {
	color: string
	size: number
	align: 'left' | 'center' | 'right'
	font: 'sans-serif' | 'serif' | 'monospace' | 'cursive'
	border: 'transparent' | 'opaque' | 'translucent' | 'shadow'
}
export const defaultTextStyle: TextStyle = {
	color: '#ffffff',
	size: 25,
	align: 'center',
	font: 'sans-serif',
	border: 'transparent',
}
