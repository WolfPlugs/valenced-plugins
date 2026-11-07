import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { isValidElement } from 'react'
import { withGifActions } from './menu-buttons'
import type { Settings } from './config'

export function patchPickerMenu(
	cleanup: (callback: () => void) => void,
	getSettings: () => Partial<Settings> | undefined,
	onSelect: (gif: unknown, attach: boolean) => unknown,
) {
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('GIFPickerItemActionSheet'),
			module => {
				if (!('default' in module) || typeof module.default !== 'function')
					return
				cleanup(
					instead(module, 'default', function (args, original) {
						const result = Reflect.apply(original, this, args)
						const props = args[0]
						if (
							!isValidElement(result) ||
							typeof props !== 'object' ||
							props === null ||
							!('item' in props)
						)
							return result
						return withGifActions(result, getSettings(), attach => {
							ActionSheetActionCreators.hideActionSheet(
								'GIFPickerItemActionSheet',
							)
							onSelect(props.item, attach)
						})
					}),
				)
			},
			{ returnNamespace: true, max: 1 },
		),
	)
}
