import { SoundGroups } from './sounds'

export type PreviewSound = {
	usage: string
	playWithListener(): Promise<boolean>
	stop(): void
}

export type SoundFactory = {
	createSoundForPack: unknown
	playSound: unknown
	createSound(name: string, usage: string): PreviewSound
}

const previews = new WeakSet<object>()
let factory: SoundFactory | undefined
let stopCurrent: (() => void) | undefined

export function isPreview(sound: object): boolean {
	return previews.has(sound)
}

export function registerSoundFactory(module: SoundFactory): () => void {
	factory = module
	return () => {
		stopPreview()
		if (factory === module) factory = undefined
	}
}

export function stopPreview(): void {
	stopCurrent?.()
}

const previewNames = new Set(
	Object.entries(SoundGroups).flatMap(([group, { names }]) =>
		group === 'discodo' ? [] : names,
	),
)

export function canPreview(name: string): boolean {
	return previewNames.has(name)
}

export async function playPreview(name: string): Promise<void> {
	if (!canPreview(name))
		throw new Error('This sound is not available for preview on Android.')
	if (!factory) throw new Error("Discord's sound player is not available yet.")
	stopPreview()
	const sound = factory.createSound(name, name)
	sound.usage = 'media'
	previews.add(sound)
	let stopped = false
	const stop = () => {
		if (stopped) return
		stopped = true
		clearTimeout(timeout)
		sound.stop()
		if (stopCurrent === stop) stopCurrent = undefined
	}
	const timeout = setTimeout(stop, 5000)
	stopCurrent = stop
	try {
		const played = await sound.playWithListener()
		if (!played && !stopped)
			throw new Error('Discord could not play this sound.')
	} finally {
		stop()
	}
}
