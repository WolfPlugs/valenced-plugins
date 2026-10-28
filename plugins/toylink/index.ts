import { Dispatcher } from '@valenced/discord/common/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { AppState } from 'react-native'
import {
	defaults,
	messageTriggers,
	readSettings,
	record,
	soundTriggers,
} from './control'
import SettingsComponent from './settings'
import { stopToys, useToys } from './toys'
import type { Settings } from './control'

type Sound = {
	name: string
	play(): unknown
	loop(): unknown
	playWithListener(): unknown
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: defaults },
	start({ cleanup, jsonStorage, plugin }) {
		let active = true
		let busy = false
		let nextPulse = 0
		let lastMessage = ''
		let wasEnabled = readSettings(jsonStorage.cache).enabled
		const ringing = new Set<string>()
		const pulse = () => {
			const settings = readSettings(jsonStorage.cache)
			if (
				!active ||
				!settings.enabled ||
				busy ||
				Date.now() < nextPulse ||
				(settings.backend === 'intiface' && AppState.currentState !== 'active')
			)
				return
			busy = true
			nextPulse = Date.now() + Math.max(2000, settings.duration * 1000)
			void useToys(settings, 'pulse')
				.catch(error => plugin.reportError(error))
				.finally(() => {
					busy = false
				})
		}
		const currentUser = () => {
			const [store] = lookupModule(
				withProps<{ getCurrentUser(): { id: string } | undefined }>(
					'getCurrentUser',
				),
			)
			return store?.getCurrentUser()?.id
		}
		const onMessage = (payload: unknown) => {
			const userId = currentUser()
			if (
				!userId ||
				!messageTriggers(payload, userId, readSettings(jsonStorage.cache))
			)
				return
			if (
				!record(payload) ||
				!record(payload.message) ||
				typeof payload.message.id !== 'string' ||
				payload.message.id === lastMessage
			)
				return
			lastMessage = payload.message.id
			pulse()
		}
		const onCall = (payload: unknown) => {
			if (!record(payload)) return
			const call = record(payload.call) ? payload.call : payload
			const channel = call.channel_id ?? call.channelId ?? payload.channelId
			const userId = currentUser()
			if (
				typeof channel !== 'string' ||
				!userId ||
				!Array.isArray(call.ringing)
			)
				return
			if (!call.ringing.includes(userId)) {
				ringing.delete(channel)
				return
			}
			if (ringing.has(channel)) return
			ringing.add(channel)
			if (readSettings(jsonStorage.cache).triggers.incomingCalls) pulse()
		}
		for (const [event, handler] of [
			['MESSAGE_CREATE', onMessage],
			['CALL_CREATE', onCall],
			['CALL_UPDATE', onCall],
		] as const) {
			Dispatcher.subscribe(event, handler)
			cleanup(() => Dispatcher.unsubscribe(event, handler))
		}
		cleanup(
			getModules(
				withProps<{ MobileAudioSound: { prototype: Sound } }>(
					'MobileAudioSound',
				),
				module => {
					const prototype = module.MobileAudioSound?.prototype
					if (!prototype) return
					for (const method of ['play', 'loop', 'playWithListener'] as const) {
						if (typeof prototype[method] !== 'function') continue
						cleanup(
							instead(prototype, method, function (args, original) {
								if (
									record(this) &&
									soundTriggers(this.name, readSettings(jsonStorage.cache))
								)
									pulse()
								return Reflect.apply(original, this, args)
							}),
						)
					}
				},
				{ max: Infinity },
			),
		)
		cleanup(
			jsonStorage.subscribe(() => {
				const enabled = readSettings(jsonStorage.cache).enabled
				if (wasEnabled && !enabled)
					void stopToys().catch(error => plugin.reportError(error))
				wasEnabled = enabled
			}),
		)
		const appState = AppState.addEventListener('change', state => {
			if (state !== 'active')
				void stopToys().catch(error => plugin.reportError(error))
		})
		cleanup(() => appState.remove())
		cleanup(() => {
			active = false
			void stopToys().catch(error => plugin.reportError(error))
		})
	},
	SettingsComponent,
})
