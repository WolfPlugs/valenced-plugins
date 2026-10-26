import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { isPreview, registerSoundFactory } from './preview'
import SettingsComponent from './settings'
import { DefaultSettings, shouldMute } from './sounds'
import type { SoundFactory } from './preview'
import type { Settings } from './sounds'

type MobileAudioSound = {
	name: string
	play(): void
	loop(): void
	playWithListener(): Promise<boolean>
}

type SoundModule = {
	MobileAudioSound: { prototype: MobileAudioSound }
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, jsonStorage, plugin }) {
		cleanup(
			getModules(
				withProps<SoundFactory>(
					'createSound',
					'createSoundForPack',
					'playSound',
				),
				module => cleanup(registerSoundFactory(module)),
			),
		)
		cleanup(
			getModules(
				withProps<SoundModule>('MobileAudioSound'),
				module => {
					const prototype = module.MobileAudioSound?.prototype
					if (
						!prototype ||
						typeof prototype.play !== 'function' ||
						typeof prototype.loop !== 'function' ||
						typeof prototype.playWithListener !== 'function'
					) {
						plugin.reportError(
							new Error(
								'This Discord version has an unsupported sound player.',
							),
						)
						plugin.disable().catch(error => plugin.reportError(error))
						return
					}

					const muted = (sound: unknown) =>
						typeof sound === 'object' &&
						sound !== null &&
						!isPreview(sound) &&
						'name' in sound &&
						shouldMute(sound.name, jsonStorage.cache ?? DefaultSettings)
					for (const method of ['play', 'loop'] as const) {
						cleanup(
							instead(prototype, method, function (args, original) {
								if (!muted(this)) return Reflect.apply(original, this, args)
							}),
						)
					}
					cleanup(
						instead(prototype, 'playWithListener', function (args, original) {
							return muted(this)
								? Promise.resolve(true)
								: Reflect.apply(original, this, args)
						}),
					)
				},
				{ max: Infinity },
			),
		)
	},
	SettingsComponent,
})
