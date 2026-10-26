import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { AppState, Linking, View } from 'react-native'
import { normalizeSettings } from './config'
import {
	completionAllowed,
	displayOnlySettings,
	PolicyUrl,
	UsageWarning,
	WarningVersion,
} from './warning-policy'
import type { JsonStorage } from '@valenced/json-storage'
import type { Settings } from './config'

const AlertKey = 'questify-usage-warning'
function UsageDialog({
	accept,
	decline,
}: {
	accept: () => Promise<void>
	decline: () => Promise<void>
}) {
	const [remaining, setRemaining] = useState(10)
	useEffect(() => {
		const timer = setInterval(() => {
			setRemaining(value => Math.max(0, value - 1))
		}, 1000)
		return () => clearInterval(timer)
	}, [])
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	async function apply(action: () => Promise<void>) {
		setSaving(true)
		try {
			await action()
			AlertActionCreators.dismissAlert(AlertKey)
		} catch {
			setError('Could not save your choice. Please try again.')
			setSaving(false)
		}
	}
	return (
		<Design.AlertModal
			title="Questify: read before using auto-completion"
			content={<Design.Text>{UsageWarning}</Design.Text>}
			extraContent={
				<View>
					<Design.Text
						color="text-link"
						onPress={() => Linking.openURL(PolicyUrl)}
					>
						Read Discord's platform manipulation policy
					</Design.Text>
					{!!error && <Design.Text>{error}</Design.Text>}
				</View>
			}
			actions={
				<View style={{ gap: 8 }}>
					<Design.Button
						text="Use display features only"
						variant="primary"
						disabled={saving}
						onPress={() => apply(decline)}
					/>
					<Design.Button
						text={remaining > 0 ? `Accept risk (${remaining}s)` : 'Accept risk'}
						variant="destructive"
						disabled={saving || remaining > 0}
						onPress={() => apply(accept)}
					/>
				</View>
			}
		/>
	)
}
export async function showUsageWarning(
	storage: JsonStorage<Settings>,
	afterAccept?: () => Promise<void>,
) {
	try {
		await storage.get()
	} catch {
		ToastActionCreators.open('QUESTIFY_SETTINGS_ERROR', {
			text: 'Could not load your saved choice. Please try again.',
			variant: 'critical',
		})
		return
	}
	if (normalizeSettings(storage.cache).warningVersion > 0) {
		void storage
			.set({ autoCompletionAllowed: true })
			.then(() => afterAccept?.())
			.catch(() =>
				ToastActionCreators.open('QUESTIFY_SETTINGS_ERROR', {
					text: 'Could not save this setting. Please try again.',
					variant: 'critical',
				}),
			)
		return
	}

	AlertActionCreators.openAlert(
		AlertKey,
		<UsageDialog
			key={Date.now()}
			accept={async () => {
				await storage.set({
					warningVersion: WarningVersion,
					autoCompletionAllowed: true,
				})
				await afterAccept?.()
			}}
			decline={() =>
				storage.set(displayOnlySettings(normalizeSettings(storage.cache)), true)
			}
		/>,
		undefined,
		{ dismissable: false },
	)
}
export function warnBeforeSetting(
	storage: JsonStorage<Settings>,
	_key: string,
	enable: boolean,
	apply: () => Promise<void>,
) {
	if (enable && !completionAllowed(normalizeSettings(storage.cache))) {
		showUsageWarning(storage, apply)
		return
	}
	void apply().catch(() =>
		ToastActionCreators.open('QUESTIFY_SETTINGS_ERROR', {
			text: 'Could not save this setting. Please try again.',
			variant: 'critical',
		}),
	)
}
export function scheduleStartupWarning(
	cleanup: (fn: () => void) => void,
	storage: JsonStorage<Settings>,
) {
	let shown = false
	let disposed = false
	let checking = false
	const show = async () => {
		if (disposed || shown || checking) return
		checking = true
		try {
			await storage.get()
		} catch {
			checking = false
			return
		}
		checking = false
		if (
			!disposed &&
			!shown &&
			AppState.currentState === 'active' &&
			normalizeSettings(storage.cache).warningVersion === 0
		) {
			shown = true
			void showUsageWarning(storage)
		}
	}
	const timer = setTimeout(show, 2000)
	const listener = AppState.addEventListener('change', show)
	cleanup(() => {
		disposed = true
		clearTimeout(timer)
		listener.remove()
		if (shown) AlertActionCreators.dismissAlert(AlertKey)
	})
}
