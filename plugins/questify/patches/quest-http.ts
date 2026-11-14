import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { instead } from '@valenced/patcher'
import { protectQuestRequest } from '../completion/requests'
import type { QuestHTTPOptions } from '../completion/requests'

type HTTP = {
	get(options: QuestHTTPOptions, ...rest: unknown[]): Promise<unknown>
	post(options: QuestHTTPOptions, ...rest: unknown[]): Promise<unknown>
}

export function patchQuestHTTP(cleanup: (fn: () => void) => void) {
	cleanup(
		getModuleWithImportedPath<{ HTTP?: HTTP }>(
			'../discord_common/js/packages/http-utils/HTTPUtils.tsx',
			({ HTTP: http }) => {
				if (!http) return
				for (const method of ['get', 'post'] as const) {
					if (typeof http[method] !== 'function') continue
					cleanup(
						instead(http, method, ([options, ...rest], original) =>
							original(protectQuestRequest(method, options), ...rest),
						),
					)
				}
			},
		),
	)
}
