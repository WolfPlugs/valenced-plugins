import { Dispatcher } from '@valenced/discord/common/flux'
import { getStore } from '@valenced/discord/flux'
import { callNativeMethod } from '@valenced/modules/native'
import type { DiscordModules } from '@valenced/discord/types'

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'wolfie.chat-ragdoll.update': (push: boolean) => boolean
	}
}

type ChannelStore = {
	getChannelId(): string | undefined
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}

export default plugin({
	start({ cleanup, plugin }) {
		const update = (push: boolean) => {
			callNativeMethod('wolfie.chat-ragdoll.update', [push]).catch(error =>
				plugin.reportError(error),
			)
		}
		cleanup(
			getStore<ChannelStore>('SelectedChannelStore', store => {
				let channel = store.getChannelId()
				let lastMessage: string | undefined
				const onChannel = () => {
					const next = store.getChannelId()
					if (next === channel) return
					channel = next
					lastMessage = undefined
					update(false)
				}
				const onMessage = (event: DiscordModules.Flux.DispatcherPayload) => {
					const message: unknown = event.message
					if (
						typeof message !== 'object' ||
						message === null ||
						!('id' in message)
					)
						return
					const id = message.id
					const messageChannel: unknown =
						event.channelId ??
						('channel_id' in message ? message.channel_id : undefined)
					if (
						typeof id !== 'string' ||
						!channel ||
						messageChannel !== channel ||
						id === lastMessage
					)
						return
					lastMessage = id
					update(true)
				}
				store.addChangeListener(onChannel)
				Dispatcher.subscribe('MESSAGE_CREATE', onMessage)
				cleanup(() => store.removeChangeListener(onChannel))
				cleanup(() => Dispatcher.unsubscribe('MESSAGE_CREATE', onMessage))
			}),
		)
	},
})
