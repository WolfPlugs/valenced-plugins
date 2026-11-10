import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { React, ReactNative } from '@valenced/react'
import { reportModuleError } from '../lib/modules'
import { FriendsRows } from './FriendsRows'
import { OverviewRows } from './OverviewRows'
import { ServerBanner } from './ServerBanner'
import { ServerHeader } from './ServerHeader'
import { ServerRows } from './ServerRows'
import { useGuildInfo } from './useGuildInfo'
import type { ComponentType } from 'react'
import type {
	NativeScrollEvent,
	NativeSyntheticEvent,
	ScrollViewProps,
} from 'react-native'

export interface ServerInfoSheetProps {
	guildId: string
}

let scrollContainerModule: ComponentType<ScrollViewProps> | undefined
function getScrollContainer() {
	if (scrollContainerModule) return scrollContainerModule
	try {
		const [exports] = lookupModule(
			withProps<{ BottomSheetScrollView: ComponentType<ScrollViewProps> }>(
				'BottomSheetScrollView',
			),
		)
		if (exports?.BottomSheetScrollView) {
			scrollContainerModule = exports.BottomSheetScrollView
		}
	} catch (error) {
		reportModuleError(error)
	}
	return scrollContainerModule
}

export default function ServerInfoSheet({ guildId }: ServerInfoSheetProps) {
	const RN = ReactNative
	const { View, ActivityIndicator, ScrollView } = RN
	const Animated = RN.Animated
	const { ActionSheet, Text } = Design
	const sideInset =
		('space' in Design
			? (Design.space as { PX_16?: number }).PX_16
			: undefined) ?? 16
	const extraBleed = 12
	const bleed = sideInset + extraBleed
	const BANNER_HEIGHT = 140
	const bannerSpacing =
		('space' in Design
			? (Design.space as { PX_12?: number }).PX_12
			: undefined) ?? 12
	const ScrollContainer = getScrollContainer() ?? ScrollView

	const { guild, isLoading, ...info } = useGuildInfo(guildId)
	const scrollY = React.useRef(new Animated.Value(0)).current

	if (!guild && !isLoading) return null
	if (!guild && isLoading) {
		return (
			<ActionSheet scrollable startExpanded>
				<ScrollContainer contentContainerStyle={{ flexGrow: 1 }}>
					<View
						style={{
							flex: 1,
							alignItems: 'center',
							justifyContent: 'center',
							padding: 40,
						}}
					>
						<ActivityIndicator size="large" color="#5865f2" />
						<Text
							variant="text-md/normal"
							color="text-subtle"
							style={{ marginTop: 12 }}
						>
							Loading server info…
						</Text>
					</View>
				</ScrollContainer>
			</ActionSheet>
		)
	}
	if (!guild) return null

	return (
		<ActionSheet
			scrollable
			handleDisabled
			startExpanded
			contentStyles={{ paddingHorizontal: 0, paddingBottom: 24 }}
		>
			<View
				style={{ width: '100%', position: 'relative', overflow: 'visible' }}
			>
				{info.bannerUri != null && (
					<ServerBanner
						uri={info.bannerUri}
						bleed={bleed}
						height={BANNER_HEIGHT}
						scrollY={scrollY}
					/>
				)}
				<ScrollContainer
					contentContainerStyle={{
						flexGrow: 1,
						paddingTop:
							info.bannerUri != null ? BANNER_HEIGHT + bannerSpacing : 0,
						paddingBottom: 24,
						paddingHorizontal: 0,
						gap: 16,
					}}
					nestedScrollEnabled={true}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
					onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
						const y = e?.nativeEvent?.contentOffset?.y ?? 0
						scrollY.setValue(y)
					}}
					scrollEventThrottle={16}
				>
					{/* Content wrapper -- banner is absolute, content is padded down via ScrollContainer */}
					<View
						style={{
							marginHorizontal: -sideInset,
							paddingHorizontal: sideInset,
							gap: 16,
							paddingTop: 8,
						}}
					>
						<ServerHeader
							name={guild.name}
							description={guild.description}
							iconUri={info.iconUri}
						/>
						<OverviewRows {...info} />
						<ServerRows guildId={guildId} {...info} />
						<FriendsRows guildId={guildId} friends={info.friends} />
					</View>
				</ScrollContainer>
			</View>
		</ActionSheet>
	)
}
