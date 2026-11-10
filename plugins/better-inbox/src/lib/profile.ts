import { lookupModule } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'

export interface UserProfileOptions {
	userId: string
	guildId?: string
	ignoreBlockedSpeedBump: boolean
}

type OpenUserProfile = (options: UserProfileOptions) => unknown
interface UserProfileModule {
	default?: OpenUserProfile
	showUserProfileActionSheetPostConnection: OpenUserProfile
	getUserProfileActionSheetKey(userId: string): string
}

export function getUserProfileOpener(): OpenUserProfile | undefined {
	const [module] = lookupModule(
		withProps<UserProfileModule>(
			'showUserProfileActionSheetPostConnection',
			'getUserProfileActionSheetKey',
		),
	)
	if (typeof module?.default === 'function') return module.default
	if (typeof module?.showUserProfileActionSheetPostConnection === 'function')
		return module.showUserProfileActionSheetPostConnection

	// Property filters only see initialized modules. Fingerprint the native profile
	// module's dependencies so the finder can initialize it on the first tap.
	const [, asyncToGeneratorId] = lookupModule(withName('_asyncToGenerator'))
	const [, asyncRequireId] = lookupModule(withName('asyncRequire'))
	if (asyncToGeneratorId === undefined || asyncRequireId === undefined) return
	const { relative } = withDependencies
	const [open] = lookupModule(
		withName<OpenUserProfile>('showUserProfileActionSheet').and(
			withDependencies([
				asyncToGeneratorId,
				null,
				null,
				null,
				null,
				asyncRequireId,
				relative(1),
				relative(2),
				null,
				relative(3),
				null,
				null,
				2,
			]),
		),
	)
	return typeof open === 'function' ? open : undefined
}
