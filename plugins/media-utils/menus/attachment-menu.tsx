import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Children, cloneElement, isValidElement } from 'react'
import SearchImageIcon from '../search/search-icon'
import { openSearch } from '../search/sheets'
import { readMediaSource } from '../utils/media'
import { MediaOptionsRow } from './viewer-menu'
import type { ReactNode } from 'react'
import type { SettingsStore } from '../settings/config'

export function patchAttachmentMenu(
	cleanup: (callback: () => void) => void,
	reportError: (error: unknown) => void,
	store: SettingsStore,
) {
	cleanup(
		getModules(
			withName<(...args: unknown[]) => unknown>('LongPressMessageActionSheet'),
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
							!('message' in props)
						)
							return result
						const sources = attachmentSources(props)
						const source = sources[0]
						if (!source || !isValidElement<{ children?: ReactNode }>(result))
							return result
						const sheet = result.props.children
						if (!isValidElement<{ children?: ReactNode }>(sheet)) return result
						const groups = Children.toArray(sheet.props.children)
						const group = groups[0]
						if (!isValidElement<{ children?: ReactNode }>(group)) return result
						const rows = Children.toArray(group.props.children)
						const images = sources.filter(source => source.kind === 'image')
						const searchRows = images.map((image, index) => (
							<Design.ActionSheetRow
								key={`media-utils-search-${image.uri}`}
								label={
									images.length === 1
										? 'Search image'
										: `Search image ${index + 1}`
								}
								icon={
									<Design.ActionSheetRow.Icon IconComponent={SearchImageIcon} />
								}
								onPress={() => openSearch(image.searchUri, reportError)}
							/>
						))
						groups[0] = cloneElement(
							group,
							{},
							...rows.slice(0, 2),
							...searchRows,
							<MediaOptionsRow key="media-utils-options" store={store} />,
							...rows.slice(2),
						)
						return cloneElement(result, {}, cloneElement(sheet, {}, ...groups))
					}),
				)
			},
			{ returnNamespace: true, max: Infinity },
		),
	)
}

function attachmentSources(props: object) {
	if ('selectedMedia' in props && props.selectedMedia != null) {
		const media = props.selectedMedia
		if (
			typeof media !== 'object' ||
			!('mediaType' in media) ||
			(media.mediaType !== 'image' && media.mediaType !== 'video') ||
			!('mediaUrl' in media)
		)
			return []
		const source = readMediaSource({
			uri: media.mediaUrl,
			contentType: media.mediaType === 'video' ? 'video/mp4' : 'image/png',
		})
		return source ? [source] : []
	}
	if (
		!('message' in props) ||
		typeof props.message !== 'object' ||
		props.message === null ||
		!('attachments' in props.message) ||
		!Array.isArray(props.message.attachments)
	)
		return []
	return props.message.attachments.flatMap((attachment: unknown) => {
		if (
			typeof attachment !== 'object' ||
			attachment === null ||
			!('url' in attachment)
		)
			return []
		const contentType =
			'content_type' in attachment ? attachment.content_type : undefined
		if (
			typeof contentType !== 'string' ||
			(!contentType.startsWith('image/') && !contentType.startsWith('video/'))
		)
			return []
		const source = readMediaSource({ uri: attachment.url, contentType })
		return source ? [source] : []
	})
}
