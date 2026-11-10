import { Constants } from '@valenced/discord/common/constants'
import { Stores } from '@valenced/discord/flux'
import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { parseSessions } from './sessions'

export const SessionsStorePath = 'modules/auth_sessions/AuthSessionsStore.tsx'
export const SessionsScreenPath =
	'modules/user_settings/devices/native/UserSettingsSessions.tsx'
export const SessionActionsPath =
	'modules/auth_sessions/AuthSessionsActionCreators.tsx'
export const YouBarPath = 'modules/main_tabs_v2/native/you_bar/YouBar.tsx'

export type SessionsStore = {
	getSessions(): unknown
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}

export type SessionActions = {
	fetchAuthSessions(): Promise<unknown>
	logOutSessions(hashes: string[]): Promise<unknown>
}

export function getSessionsStore() {
	return lookupModuleWithImportedPath<{ default: SessionsStore }>(
		SessionsStorePath,
	)[0]?.default
}

export function getSessions() {
	return parseSessions(getSessionsStore()?.getSessions())
}

export function getSessionActions() {
	return lookupModuleWithImportedPath<SessionActions>(SessionActionsPath)[0]
}

export function getOwner(): string | undefined {
	const store = Stores.UserStore
	if (
		!store ||
		!('getCurrentUser' in store) ||
		typeof store.getCurrentUser !== 'function'
	)
		return
	const user: unknown = store.getCurrentUser()
	if (
		typeof user === 'object' &&
		user !== null &&
		'id' in user &&
		typeof user.id === 'string'
	)
		return user.id
}

export function openDevicesSettings() {
	const settings = lookupModuleWithImportedPath<{
		openUserSettings(section: string): void
	}>('modules/user_settings/core/native/openUserSettings.tsx')[0]
	if (!settings) throw new Error('Discord settings are unavailable')
	const sections: unknown = Constants?.UserSettingsSections
	if (
		typeof sections !== 'object' ||
		sections === null ||
		!('SESSIONS' in sections) ||
		typeof sections.SESSIONS !== 'string'
	)
		throw new Error('Discord Devices settings are unavailable')
	settings.openUserSettings(sections.SESSIONS)
}
