import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import { isMemoQuestMenu } from './components'

export function patchVideoFocus(
	cleanup: (fn: () => void) => void,
	enabled: () => boolean,
) {
	const patchArgs = (args: unknown[]) => [
		videoFocusProps(args[0], enabled()),
		...args.slice(1),
	]
	cleanup(
		getModules(
			withProps<{ type: unknown }>('type'),
			memo => {
				if (isMemoQuestMenu(memo, 'VideoQuestPlayer'))
					cleanup(before(memo, 'type', patchArgs))
			},
			{ max: Infinity },
		),
	)
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('VideoQuestPlayer'),
			module => {
				if ('default' in module && typeof module.default === 'function')
					cleanup(before(module, 'default', patchArgs))
			},
			{ returnNamespace: true, max: Infinity },
		),
	)
}

export function videoFocusProps(props: unknown, enabled: boolean) {
	return enabled && typeof props === 'object' && props !== null
		? { ...props, externallyPaused: false }
		: props
}
