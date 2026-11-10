import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { React } from '@valenced/react'
import { View } from 'react-native'
import { DevicesContext, useDevices } from './context'
import type { ReactNode } from 'react'
import type { DeviceController } from './context'

const AlertKey = 'wolfie.better-devices.logout'

export function dismissLogoutConfirmation() {
	AlertActionCreators.dismissAlert(AlertKey)
}

export function DevicesView({
	controller,
	children,
}: {
	controller: DeviceController
	children: ReactNode
}) {
	const state = React.useSyncExternalStore(
		controller.tracker.subscribe,
		controller.tracker.getSnapshot,
	)
	const [selected, setSelected] = React.useState<string[]>([])
	const [fresh] = React.useState(() => [...state.pending])
	const [busy, setBusy] = React.useState(false)
	const running = React.useRef(false)
	const mounted = React.useRef(true)
	React.useEffect(() => {
		mounted.current = true
		controller.tracker.acknowledge(fresh)
		return () => {
			mounted.current = false
			dismissLogoutConfirmation()
		}
	}, [controller, fresh])

	async function logout(hashes: readonly string[]) {
		if (running.current || !mounted.current) return
		running.current = true
		setBusy(true)
		try {
			const result = await controller.logout(hashes)
			if (!mounted.current) return
			setSelected(previous =>
				previous.filter(hash => !result.removed.includes(hash)),
			)
			ToastActionCreators.open('BETTER_DEVICES_LOGOUT_RESULT', {
				text: result.mfa
					? 'Discord requires verification. Use its native log out all action to continue.'
					: result.failed.length > 0
						? `Logged out ${result.removed.length} device(s). ${result.failed.length} could not be logged out.`
						: `Logged out ${result.removed.length} device(s).`,
				variant: result.failed.length > 0 ? 'critical' : 'success',
			})
		} catch (error) {
			controller.reportError(error)
			if (mounted.current)
				ToastActionCreators.open('BETTER_DEVICES_LOGOUT_ERROR', {
					text: 'Could not log out the selected devices. Please try again.',
					variant: 'critical',
				})
		} finally {
			running.current = false
			if (mounted.current) setBusy(false)
		}
	}

	function confirm(hashes: readonly string[]) {
		if (running.current || hashes.length === 0) return
		AlertActionCreators.openAlert(
			AlertKey,
			<Design.AlertModal
				title={`Log out ${hashes.length} device${hashes.length === 1 ? '' : 's'}?`}
				content={
					<Design.Text>
						You will need to sign in again on those devices.
					</Design.Text>
				}
				actions={
					<View style={{ gap: 8 }}>
						<Design.Button
							text="Log Out"
							variant="destructive"
							onPress={() => {
								dismissLogoutConfirmation()
								void logout(hashes)
							}}
						/>
						<Design.Button
							text="Cancel"
							variant="secondary"
							onPress={dismissLogoutConfirmation}
						/>
					</View>
				}
			/>,
		)
	}

	return (
		<DevicesContext.Provider
			value={{
				selected,
				busy,
				fresh,
				toggle(hash) {
					if (running.current || hash === controller.getCurrentHash()) return
					setSelected(previous =>
						previous.includes(hash)
							? previous.filter(item => item !== hash)
							: [...previous, hash],
					)
				},
				confirm,
			}}
		>
			{children}
		</DevicesContext.Provider>
	)
}

export function DeviceControls() {
	const { selected, busy, confirm, toggle } = useDevices()
	return (
		<View style={{ gap: 8, marginBottom: 16 }}>
			<Design.Text variant="text-md/semibold">
				Check for unrecognized devices
			</Design.Text>
			<Design.Text variant="text-sm/normal" color="text-subtle">
				Log out any device you do not recognize and change your Discord
				password.
			</Design.Text>
			<Design.Text variant="text-sm/normal" color="text-subtle">
				Long press a device to select several devices to log out.
			</Design.Text>
			{selected.length > 0 && (
				<View style={{ gap: 8 }}>
					<Design.Button
						text={
							busy ? 'Logging Out…' : `Log Out Selected (${selected.length})`
						}
						variant="destructive"
						disabled={busy}
						onPress={() => confirm(selected)}
					/>
					<Design.Button
						text="Cancel Selection"
						variant="secondary"
						disabled={busy}
						onPress={() => {
							for (const hash of selected) toggle(hash)
						}}
					/>
				</View>
			)}
		</View>
	)
}
