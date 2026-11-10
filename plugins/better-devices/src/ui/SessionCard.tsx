import { Design } from '@valenced/discord/design'
import { Pressable, View } from 'react-native'
import { formatTimestamp } from '../lib/sessions'
import { useDevices } from './context'
import type { ReactNode } from 'react'
import type { Session } from '../lib/sessions'

export function SessionCard({
	session,
	current,
	children,
}: {
	session: Session
	current: boolean
	children: ReactNode
}) {
	const { selected, busy, fresh, toggle, confirm } = useDevices()
	const timestamp = formatTimestamp(session.approx_last_used_time)
	const selectionActive = selected.length > 0
	return (
		<Pressable
			disabled={current || busy}
			delayLongPress={350}
			onLongPress={() => toggle(session.id_hash)}
			onPress={selectionActive ? () => toggle(session.id_hash) : undefined}
			accessibilityHint={
				current ? undefined : 'Long press to select this device'
			}
			style={{ gap: 8, marginBottom: 16 }}
		>
			{/* The card owns gestures; the native row's nested pressable must not swallow them. */}
			<View pointerEvents="none">{children}</View>
			{fresh.includes(session.id_hash) && (
				<Design.Text variant="text-sm/semibold" color="text-feedback-critical">
					New device
				</Design.Text>
			)}
			{timestamp && (
				<Design.Text variant="text-sm/normal" color="text-subtle">
					Last active: {timestamp}
				</Design.Text>
			)}
			{!current && (
				<View>
					{selectionActive ? (
						<Design.Checkbox
							label="Select device"
							checked={selected.includes(session.id_hash)}
							onToggle={() => {
								if (!busy) toggle(session.id_hash)
							}}
						/>
					) : (
						<View style={{ gap: 8 }}>
							<Design.Button
								text="Select Device"
								variant="secondary"
								size="sm"
								disabled={busy}
								onPress={() => toggle(session.id_hash)}
							/>
							<Design.Button
								text="Log Out"
								variant="destructive"
								size="sm"
								disabled={busy}
								onPress={() => confirm([session.id_hash])}
							/>
						</View>
					)}
				</View>
			)}
		</Pressable>
	)
}
