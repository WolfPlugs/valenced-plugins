import { getActionSheetActionCreators, reportModuleError } from '../lib/modules'
import ServerInfoSheet from './ServerInfoSheet'

export function openServerInfoSheet(guildId: string): void {
	try {
		const actions = getActionSheetActionCreators()
		if (actions == null) {
			throw new Error('Server Info action sheet is unavailable')
		}
		const key = `server-info:${guildId}`
		actions.openLazy(Promise.resolve({ default: ServerInfoSheet }), key, {
			guildId,
		})
	} catch (e) {
		reportModuleError(e)
	}
}
