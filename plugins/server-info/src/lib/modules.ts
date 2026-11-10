import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { withGeneratedIconComponent } from '@valenced/utils/discord'
import { getUserProfileOpener } from './profile'
import type { UserProfileOptions } from './profile'

// Optional legacy library exports are not part of the Valenced type definitions.
let library: any
let reportError: (error: unknown) => void = error => {
	throw error
}

export function initModules(
	unscoped: object,
	report: (error: unknown) => void,
) {
	const globals = globalThis as typeof globalThis & {
		__roselib?: any
		__kmmiio?: any
		__everest?: any
	}
	const extensions = unscoped as typeof unscoped & {
		kmmiio?: any
		roselib?: any
	}
	library =
		extensions.kmmiio ??
		extensions.roselib ??
		globals.__roselib ??
		globals.__kmmiio ??
		globals.__everest
	reportError = report
	return library
}

export function reportModuleError(error: unknown) {
	reportError(error)
}

function resolveStore(name: string): any {
	return Stores[name]
}

export function getActionSheetActionCreators() {
	return library?.getActionSheetActionCreators?.() ?? ActionSheetActionCreators
}

export function getGuildStore(): any {
	return library?.getGuildStore?.() ?? resolveStore('GuildStore')
}

export function getUserStore(): any {
	return library?.getUserStore?.() ?? resolveStore('UserStore')
}

export function getGuildRoleStore(): any {
	return library?.getGuildRoleStore?.() ?? resolveStore('GuildRoleStore')
}

export function getGuildChannelStore(): any {
	return library?.getGuildChannelStore?.() ?? resolveStore('GuildChannelStore')
}

export function getGuildMemberCountStore(): any {
	return (
		library?.getGuildMemberCountStore?.() ??
		resolveStore('GuildMemberCountStore')
	)
}

export function getGuildHeaderCountsStore(): any {
	return (
		library?.getGuildHeaderCountsStore?.() ??
		resolveStore('GuildHeaderCountsStore')
	)
}

export function getBasicGuildStore(): any {
	return library?.getBasicGuildStore?.() ?? resolveStore('BasicGuildStore')
}

export function getGuildMemberStore(): any {
	return library?.getGuildMemberStore?.() ?? resolveStore('GuildMemberStore')
}

export function getRelationshipStore(): any {
	return library?.getRelationshipStore?.() ?? resolveStore('RelationshipStore')
}

export function getHTTPUtils(): any {
	return (
		library?.getHTTPUtils?.() ??
		lookupModule(withProps('get', 'post', 'put', 'patch', 'del'))?.[0]
	)
}

export function getFetchBasicGuild(): any {
	return (
		library?.getFetchBasicGuild?.() ??
		lookupModule(withProps('fetchBasicGuild'))?.[0]?.fetchBasicGuild
	)
}

export function getRequestMembersById(): any {
	return (
		library?.getRequestMembersById?.() ??
		lookupModule(withProps('requestMembersById'))?.[0]?.requestMembersById
	)
}

const PROFILE_SHEET = {
	prop: [
		'showUserProfileActionSheetPostConnection',
		'getUserProfileActionSheetKey',
	],
	anchor: 'openLazy',
} as const

export function openUserProfileSheet(options: UserProfileOptions) {
	try {
		const open =
			getUserProfileOpener() ?? library?.resolveSheet?.(PROFILE_SHEET)
		if (typeof open !== 'function')
			throw new Error('User profile action sheet is unavailable')
		open(options)
	} catch (error) {
		reportError(error)
	}
}

export function forceLoadLazySheets() {
	library?.resolveSheet?.(PROFILE_SHEET)
}

export function getInfoIcon() {
	return (
		lookupModule(
			withGeneratedIconComponent(
				'CircleInformationIcon',
				'CircleInformationIcon-primary',
				'CircleInformationIcon-secondary',
			),
		)[0]?.CircleInformationIcon ?? library?.getIcon?.('CircleInformationIcon')
	)
}
