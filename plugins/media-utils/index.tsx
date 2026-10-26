import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { isValidElement } from 'react'
import { patchImageEditor } from './editor'
import { patchFavorites } from './favorites/patches'
import { patchAttachmentMenu } from './menus/attachment-menu'
import MediaOptionsIcon from './menus/options-icon'
import { patchViewerLongPress } from './menus/viewer-menu'
import SearchImageIcon from './search/search-icon'
import { closeSheets, openSearch } from './search/sheets'
import SettingsComponent, {
	closeMediaOptions,
	openMediaOptions,
} from './settings'
import { defaultSettings, readSettings } from './settings/config'
import { readMediaSource } from './utils/media'
import { patchNativeResolution } from './viewer/full-resolution'
import RotationSurface, { resetRotations } from './viewer/rotation-surface'
import { patchZoomLimit } from './viewer/zoom'
import type { PluginOptions } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { Settings } from './settings/config'

export default {
	jsonStorage: { load: true, default: defaultSettings },
	SettingsComponent,
	start({ cleanup, plugin, jsonStorage }) {
		const reportError = (error: unknown) => plugin.reportError(error)
		cleanup(resetRotations)
		cleanup(closeSheets)
		cleanup(closeMediaOptions)
		patchImageEditor(cleanup, reportError)
		patchAttachmentMenu(cleanup, reportError, jsonStorage)
		patchViewerLongPress(cleanup, reportError, jsonStorage)
		patchZoomLimit(cleanup, () => readSettings(jsonStorage.cache).zoomEnabled)
		patchNativeResolution(cleanup)
		patchFavorites(cleanup, () => readSettings(jsonStorage.cache).favoriteMedia)
		cleanup(
			getModules(
				withProps<{
					useMediaShareActions: (...args: unknown[]) => unknown
				}>('useMediaShareActions'),
				module => {
					cleanup(
						instead(module, 'useMediaShareActions', function (args, original) {
							const actions = Reflect.apply(original, this, args)
							const props = args[0]
							if (
								!Array.isArray(actions) ||
								typeof props !== 'object' ||
								props === null ||
								!('source' in props)
							)
								return actions
							const source = readMediaSource(props.source)
							if (!source) return actions
							return [
								...actions,
								...(source.kind === 'image'
									? [
											{
												label: 'Search image',
												IconComponent: SearchImageIcon,
												action: () => openSearch(source.searchUri, reportError),
											},
										]
									: []),
								{
									label: 'Media options',
									IconComponent: MediaOptionsIcon,
									action: () => openMediaOptions(jsonStorage),
								},
							]
						}),
					)
				},
				{ max: 1 },
			),
		)
		cleanup(
			getModules(
				withProps<{
					MediaViewerItem: { type: (...args: unknown[]) => unknown }
				}>('MediaViewerItem'),
				module => {
					const item = module.MediaViewerItem
					if (
						typeof item !== 'object' ||
						item === null ||
						typeof item.type !== 'function'
					) {
						reportError(
							new Error('MediaUtils: unsupported MediaViewerItem export.'),
						)
						return
					}
					cleanup(
						instead(item, 'type', function (args, original) {
							const viewer = Reflect.apply(original, this, args)
							const props = args[0]
							if (
								typeof props !== 'object' ||
								props === null ||
								!('source' in props)
							)
								return viewer
							const source = readMediaSource(props.source)
							if (!source || !isValidElement<{ children?: ReactNode }>(viewer))
								return viewer
							return (
								<RotationSurface
									key={source.uri}
									viewer={viewer}
									kind={source.kind}
									store={jsonStorage}
									reportError={reportError}
								/>
							)
						}),
					)
				},
				{ max: 1 },
			),
		)
	},
} satisfies PluginOptions<{ jsonStorage: Settings }>
