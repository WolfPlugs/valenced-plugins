// SPDX-License-Identifier: MPL-2.0
// Adapted from Rain FavouriteAnything by kmmiio99o and theunrealzaka.
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

const videoExtension = /\.(?:mp4|webm|mov|avi|mkv|flv|wmv|m4v|gifv)(?:[?#]|$)/i

export function isFavoriteVideo(value: unknown): value is string {
	return typeof value === 'string' && videoExtension.test(value)
}

export function favoriteThumbnail(url: string): string {
	const mediaUrl = url.replace(
		/^(https?:\/\/)cdn\.discordapp\.com\//i,
		'$1media.discordapp.net/',
	)
	if (
		!/^https?:\/\/(?:media\.discordapp\.net|images-ext-[^.]+\.discordapp\.net)\//i.test(
			mediaUrl,
		)
	)
		return url
	const hashIndex = mediaUrl.indexOf('#')
	const base = hashIndex < 0 ? mediaUrl : mediaUrl.slice(0, hashIndex)
	const hash = hashIndex < 0 ? '' : mediaUrl.slice(hashIndex)
	if (/[?&]format=/i.test(base))
		return base.replace(/([?&])format=[^&]*/i, '$1format=jpeg') + hash
	return `${base}${base.includes('?') ? '&' : '?'}format=jpeg${hash}`
}

export function favoritableSource(source: unknown) {
	if (
		typeof source !== 'object' ||
		source === null ||
		!('uri' in source) ||
		typeof source.uri !== 'string'
	)
		return source
	if ('isGIFV' in source && source.isGIFV) return source
	return {
		...source,
		isGIFV: true,
		embedURI:
			('embedURI' in source && source.embedURI) ||
			('sourceURI' in source && source.sourceURI) ||
			source.uri,
		videoURI: ('videoURI' in source && source.videoURI) || source.uri,
		embedProviderName:
			('embedProviderName' in source && source.embedProviderName) || '',
	}
}

export function normalizeFavorite(data: unknown) {
	if (typeof data !== 'object' || data === null) return data
	const video =
		('url' in data && isFavoriteVideo(data.url)) ||
		('src' in data && isFavoriteVideo(data.src))
	if (video) return { ...data, format: 2 }
	if ('format' in data && data.format === 2) return { ...data, format: 1 }
	return data
}

export function patchFavorites(
	cleanup: (callback: () => void) => void,
	enabled: () => boolean,
) {
	const patchedButtons = new WeakSet<object>()
	const thumbnails = new WeakMap<unknown[], unknown[]>()
	cleanup(
		getModules(
			withProps<{ type: (...args: unknown[]) => unknown }>('type'),
			button => {
				if (
					typeof button.type !== 'function' ||
					!['GIFFavButton', 'MediaViewerOverlayButtonFavoriteGIF'].includes(
						button.type.name,
					) ||
					patchedButtons.has(button)
				)
					return
				patchedButtons.add(button)
				cleanup(
					instead(button, 'type', function (args, original) {
						if (!enabled()) return Reflect.apply(original, this, args)
						const props = args[0]
						if (
							typeof props !== 'object' ||
							props === null ||
							!('source' in props)
						)
							return Reflect.apply(original, this, args)
						return Reflect.apply(original, this, [
							{ ...props, source: favoritableSource(props.source) },
							...args.slice(1),
						])
					}),
				)
			},
			{ max: Infinity },
		),
	)
	cleanup(
		getModules(
			withProps<{ addFavoriteGIF: (...args: unknown[]) => unknown }>(
				'addFavoriteGIF',
			),
			module => {
				cleanup(
					instead(module, 'addFavoriteGIF', function (args, original) {
						if (!enabled()) return Reflect.apply(original, this, args)
						return Reflect.apply(original, this, [
							normalizeFavorite(args[0]),
							...args.slice(1),
						])
					}),
				)
			},
			{ max: 1 },
		),
	)
	cleanup(
		getModules(
			withProps<{ useFavoriteGIFsMobile: (...args: unknown[]) => unknown }>(
				'useFavoriteGIFsMobile',
			),
			module => {
				cleanup(
					instead(module, 'useFavoriteGIFsMobile', function (args, original) {
						const result = Reflect.apply(original, this, args)
						if (!enabled()) return result
						if (
							typeof result !== 'object' ||
							result === null ||
							!('favorites' in result) ||
							!Array.isArray(result.favorites)
						)
							return result
						let favorites = thumbnails.get(result.favorites)
						if (!favorites) {
							favorites = result.favorites.map((item: unknown) => {
								if (typeof item !== 'object' || item === null) return item
								const url =
									('src' in item && item.src) || ('url' in item && item.url)
								return isFavoriteVideo(url)
									? { ...item, src: favoriteThumbnail(url) }
									: item
							})
							thumbnails.set(result.favorites, favorites)
						}
						return { ...result, favorites }
					}),
				)
			},
			{ max: 1 },
		),
	)
}
