import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Image, Linking } from 'react-native'
import { searchEngines } from '../utils/media'
import bing from './icons/bing.png'
import googleLens from './icons/google-lens.png'
import imgOps from './icons/imgops.png'
import iqdb from './icons/iqdb.png'
import sauceNAO from './icons/saucenao.png'
import tinEye from './icons/tineye.png'
import yandex from './icons/yandex.png'

const providers = [
	{
		name: 'Google Lens',
		prefix: searchEngines['Google Lens'],
		icon: googleLens,
	},
	{ name: 'Yandex', prefix: searchEngines.Yandex, icon: yandex },
	{ name: 'SauceNAO', prefix: searchEngines.SauceNAO, icon: sauceNAO },
	{ name: 'IQDB', prefix: searchEngines.IQDB, icon: iqdb },
	{ name: 'Bing', prefix: searchEngines.Bing, icon: bing },
	{ name: 'TinEye', prefix: searchEngines.TinEye, icon: tinEye },
	{ name: 'ImgOps', prefix: searchEngines.ImgOps, icon: imgOps },
]

const searchKey = 'wolfie.media-utils.search'
type SearchProps = { uri: string; reportError: (error: unknown) => void }

function SearchSheet({ uri, reportError }: SearchProps) {
	const { ActionSheet, ActionSheetRow, BottomSheetTitleHeader } = Design
	return (
		<ActionSheet
			scrollable
			header={<BottomSheetTitleHeader title="Search image" />}
		>
			<ActionSheetRow.Group hasIcons>
				{providers.map(({ name, prefix, icon }) => (
					<ActionSheetRow
						key={name}
						label={name}
						icon={
							<ActionSheetRow.Icon
								IconComponent={() => (
									<Image
										accessible={false}
										source={{ uri: icon }}
										resizeMode="contain"
										style={{ width: 24, height: 24 }}
									/>
								)}
							/>
						}
						onPress={() => {
							ActionSheetActionCreators.hideActionSheet(searchKey)
							void Linking.openURL(prefix + encodeURIComponent(uri)).catch(
								reportError,
							)
						}}
					/>
				))}
			</ActionSheetRow.Group>
		</ActionSheet>
	)
}

export function openSearch(
	uri: string,
	reportError: SearchProps['reportError'],
) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: SearchSheet }),
		searchKey,
		{ uri, reportError },
		'stack',
	)
}

export function closeSheets() {
	ActionSheetActionCreators.hideActionSheet(searchKey)
}
