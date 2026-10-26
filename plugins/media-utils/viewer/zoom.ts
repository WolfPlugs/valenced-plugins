import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

export const maximumImageZoom = 100

export function patchZoomLimit(
	cleanup: (callback: () => void) => void,
	enabled: () => boolean,
) {
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('getMediaViewerStateForScreen'),
			module => {
				if (!('default' in module) || typeof module.default !== 'function')
					return
				cleanup(
					instead(module, 'default', function (args, original) {
						const result = Reflect.apply(original, this, args)
						if (!enabled() || typeof result !== 'object' || result === null)
							return result
						return { ...result, maximumZoomScale: maximumImageZoom }
					}),
				)
			},
			{ returnNamespace: true, max: 1 },
		),
	)
}
