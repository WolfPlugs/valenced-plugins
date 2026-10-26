import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Children, cloneElement, isValidElement } from 'react'
import SearchImageIcon from '../search/search-icon'
import { openSearch } from '../search/sheets'
import { openMediaOptions } from '../settings'
import { readMediaSource } from '../utils/media'
import MediaOptionsIcon from './options-icon'
import type { ReactNode } from 'react'
import type { SettingsStore } from '../settings/config'

export function MediaOptionsRow({ store }: { store: SettingsStore }) {
	return (
		<Design.ActionSheetRow
			label="Media options"
			icon={<Design.ActionSheetRow.Icon IconComponent={MediaOptionsIcon} />}
			onPress={() => openMediaOptions(store)}
		/>
	)
}
export function patchViewerLongPress(
	cleanup: (callback: () => void) => void,
	reportError: (error: unknown) => void,
	store: SettingsStore,
) {
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('MediaShareActionSheet'),
			module => {
				if (!('default' in module) || typeof module.default !== 'function')
					return
				cleanup(
					instead(module, 'default', function (args, original) {
						const result = Reflect.apply(original, this, args)
						const props = args[0]
						if (
							typeof props !== 'object' ||
							props === null ||
							!('source' in props)
						)
							return result
						const media = readMediaSource(props.source)
						if (!media || !isValidElement<{ children?: ReactNode }>(result))
							return result
						const group = result.props.children
						if (!isValidElement<{ children?: ReactNode }>(group)) return result
						const rows = Children.toArray(group.props.children)
						const hasLabel = (label: string) =>
							rows.some(
								row =>
									isValidElement<{ label?: string }>(row) &&
									row.props.label === label,
							)
						if (media.kind === 'image' && !hasLabel('Search image'))
							rows.push(
								<Design.ActionSheetRow
									key="media-utils-search"
									label="Search image"
									icon={
										<Design.ActionSheetRow.Icon
											IconComponent={SearchImageIcon}
										/>
									}
									onPress={() => openSearch(media.searchUri, reportError)}
								/>,
							)
						if (!hasLabel('Media options'))
							rows.push(
								<MediaOptionsRow key="media-utils-options" store={store} />,
							)
						return cloneElement(result, {}, cloneElement(group, {}, ...rows))
					}),
				)
			},
			{ returnNamespace: true, max: Infinity },
		),
	)
}
