import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { EditorButton, EditorIconButton } from '../shared/editor-icon'
import { defaultTextStyle } from '../shared/markup'
import type { CanvasCommand } from '../protocol'
import type { Brush, TextStyle } from '../shared/markup'

type Drawer = 'align' | 'font' | 'color' | 'border'
export type MarkupTool = 'Draw' | 'Emoji' | 'Text'
const colors = [
	'#ffffff',
	'#000000',
	'#ed4245',
	'#fee75c',
	'#57f287',
	'#5865f2',
	'#eb459e',
]
const brushes = [
	['pen', 'Pen'],
	['highlighter', 'Highlighter'],
	['mosaic', 'Mosaic'],
	['eraser', 'Eraser'],
] as const
const alignments = [
	['left', 'Left'],
	['center', 'Center'],
	['right', 'Right'],
] as const
const fonts = [
	['sans-serif', 'Sans'],
	['serif', 'Serif'],
	['monospace', 'Mono'],
	['cursive', 'Script'],
] as const
const borders = [
	['transparent', 'Transparent'],
	['opaque', 'Opaque'],
	['translucent', 'Translucent'],
	['shadow', 'Text shadow'],
] as const
const row = { flexDirection: 'row', alignItems: 'center', gap: 6 } as const

function Choices<T extends string>({
	options,
	value,
	onChange,
}: {
	options: readonly (readonly [T, string])[]
	value: T
	onChange(value: T): void
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={row}
		>
			{options.map(([key, label]) => (
				<Design.Button
					key={key}
					text={label}
					accessibilityState={{ selected: value === key }}
					variant={value === key ? 'primary' : 'tertiary'}
					size="sm"
					onPress={() => onChange(key)}
				/>
			))}
		</ScrollView>
	)
}

function Palette({
	color,
	onChange,
}: {
	color: string
	onChange(color: string): void
}) {
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={row}
		>
			{colors.map(value => (
				<EditorButton
					key={value}
					text=""
					size="sm"
					variant="tertiary"
					accessibilityLabel={`Color ${value}`}
					accessibilityState={{ selected: value === color }}
					icon={
						<View
							style={{
								width: 19,
								height: 19,
								borderRadius: 10,
								backgroundColor: value,
								borderColor: value === color ? '#949cff' : '#777',
								borderWidth: value === color ? 3 : 1,
							}}
						/>
					}
					onPress={() => onChange(value)}
				/>
			))}
		</ScrollView>
	)
}

export function MarkupPanel({
	tool,
	onTool,
	send,
	history,
	onEmoji,
}: {
	tool: MarkupTool | undefined
	onTool(tool: MarkupTool): void
	send(command: CanvasCommand): void
	history: { undo: boolean; redo: boolean }
	onEmoji(): void
}) {
	const [brush, setBrush] = useState<Brush>('pen')
	const [inkColor, setInkColor] = useState('#ed4245')
	const [brushSize, setBrushSize] = useState(8)
	const [style, setStyle] = useState(defaultTextStyle)
	const [text, setText] = useState('')
	const [drawer, setDrawer] = useState<Drawer>('font')
	useEffect(() => {
		if (tool === 'Draw')
			send({
				type: 'tool',
				draw: true,
				brush,
				color: inkColor,
				size: brushSize,
			})
		else if (tool) send({ type: 'tool', draw: false })
	}, [tool, brush, inkColor, brushSize])
	function updateStyle(next: Partial<TextStyle>) {
		const value = { ...style, ...next }
		setStyle(value)
		send({ type: 'text-style', style: next })
	}
	if (!tool) return null
	return (
		<View
			style={{
				borderRadius: 20,
				backgroundColor: '#1d1d21',
				padding: 10,
				gap: 8,
			}}
		>
			{tool === 'Draw' && (
				<>
					<View style={{ ...row, justifyContent: 'space-evenly', gap: 0 }}>
						{brushes.map(([value, label]) => (
							<EditorIconButton
								key={value}
								name={value}
								label={label}
								active={brush === value}
								onPress={() => setBrush(value)}
							/>
						))}
						<EditorIconButton
							name="UndoIcon"
							label="Undo drawing"
							disabled={!history.undo}
							onPress={() => send({ type: 'undo-draw' })}
						/>
						<EditorIconButton
							name="DrawRedo"
							label="Redo drawing"
							disabled={!history.redo}
							onPress={() => send({ type: 'redo-draw' })}
						/>
					</View>
					<View style={row}>
						<Design.Text style={{ color: '#fff', minWidth: 48 }}>
							Size {brushSize}
						</Design.Text>
						<View style={{ flex: 1 }}>
							<Design.Slider
								minimumValue={1}
								maximumValue={50}
								step={1}
								value={brushSize}
								onValueChange={setBrushSize}
							/>
						</View>
					</View>
					{(brush === 'pen' || brush === 'highlighter') && (
						<Palette color={inkColor} onChange={setInkColor} />
					)}
				</>
			)}
			{tool === 'Text' && (
				<>
					<View style={row}>
						<View style={{ flex: 1 }}>
							<Design.TextInput
								value={text}
								onChange={setText}
								placeholder="Add text"
								multiline
								maxLength={1000}
								style={{ maxHeight: 78 }}
							/>
						</View>
						<Design.Button
							text="Add"
							size="sm"
							disabled={!text.trim()}
							onPress={() => {
								send({ type: 'text', text: text.trim(), style })
								setText('')
							}}
						/>
					</View>
					<View style={row}>
						<Design.Text style={{ color: '#fff', minWidth: 48 }}>
							Size {style.size}
						</Design.Text>
						<View style={{ flex: 1 }}>
							<Design.Slider
								minimumValue={1}
								maximumValue={50}
								step={1}
								value={style.size}
								onValueChange={size => updateStyle({ size })}
							/>
						</View>
					</View>
					<Choices<Drawer>
						options={[
							['align', 'Align'],
							['font', 'Font'],
							['color', 'Color'],
							['border', 'Border'],
						]}
						value={drawer}
						onChange={setDrawer}
					/>
					{drawer === 'align' && (
						<Choices
							options={alignments}
							value={style.align}
							onChange={align => updateStyle({ align })}
						/>
					)}
					{drawer === 'font' && (
						<Choices
							options={fonts}
							value={style.font}
							onChange={font => updateStyle({ font })}
						/>
					)}
					{drawer === 'color' && (
						<Palette
							color={style.color}
							onChange={color => updateStyle({ color })}
						/>
					)}
					{drawer === 'border' && (
						<Choices
							options={borders}
							value={style.border}
							onChange={border => updateStyle({ border })}
						/>
					)}
				</>
			)}
			{tool === 'Emoji' && (
				<EditorIconButton
					name="EmojiGrid"
					label="Open emoji picker"
					onPress={onEmoji}
				/>
			)}
			<View style={{ ...row, justifyContent: 'space-evenly' }}>
				{(
					[
						['Draw', 'pen'],
						['Emoji', 'Decorations'],
						['Text', 'TextTool'],
					] as const
				).map(([value, icon]) => (
					<EditorIconButton
						key={value}
						name={icon}
						label={value}
						active={tool === value}
						onPress={() => {
							onTool(value)
							if (value === 'Emoji') onEmoji()
						}}
					/>
				))}
			</View>
		</View>
	)
}
