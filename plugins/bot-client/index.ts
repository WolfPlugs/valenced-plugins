import {
	addSettingsItemToSection,
	onSettingsModulesLoaded,
	refreshSettings,
	registerSettingsItem,
} from '@valenced/discord/modules/settings'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { createElement } from 'react'
import { installEmbedBuilder } from './composer'
import AccountScreen, { closeAccountAlerts } from './screen'
import { installBotSession } from './session'
import { closeAccountSheet } from './sheet'
import type { AccountStorage } from './accounts'

export default plugin<{ jsonStorage: AccountStorage }>({
	jsonStorage: { load: true, default: { accounts: [] } },
	preInit({ cleanup, plugin }) {
		installBotSession(
			cleanup,
			() => {},
			error => plugin.reportError(error),
		)
	},
	start({ cleanup, jsonStorage, plugin }) {
		installEmbedBuilder(cleanup, error => plugin.reportError(error))
		cleanup(refreshSettings)
		cleanup(closeAccountSheet)
		cleanup(closeAccountAlerts)
		cleanup(
			onSettingsModulesLoaded(() => {
				cleanup(
					registerSettingsItem('WolfieBotClient', {
						parent: null,
						type: 'route',
						useTitle: () => 'Bot Client',
						IconComponent: lookupGeneratedIconComponent('RobotIcon'),
						screen: {
							route: 'WolfieBotClient',
							getComponent: () => () =>
								createElement(AccountScreen, {
									storage: jsonStorage,
									reportError: error => plugin.reportError(error),
								}),
						},
					}),
				)
				cleanup(addSettingsItemToSection('VALENCED', 'WolfieBotClient'))
				refreshSettings()
			}),
		)
	},
	SettingsComponent: ({ api }) =>
		createElement(AccountScreen, {
			storage: api.jsonStorage,
			reportError: error => api.plugin.reportError(error),
		}),
})
