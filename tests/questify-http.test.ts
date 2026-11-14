import { expect, test } from 'bun:test'
import {
	protectQuestRequest,
	questRequestError,
} from '../plugins/questify/completion/requests'

test('quest refresh and video rejections stay request errors', () => {
	for (const [method, url] of [
		['get', '/quests/@me?test=true'],
		['post', '/quests/123/video-progress'],
	] as const) {
		const request = protectQuestRequest(method, { url })
		const failures: unknown[] = []
		const response = {
			status: 401,
			body: { code: 40001, message: 'Unauthorized' },
		}
		expect(
			request.interceptResponse?.(response, undefined, (error: unknown) =>
				failures.push(error),
			),
		).toBe(true)
		expect(questRequestError(failures[0]).message).toContain(
			'HTTP 401: Unauthorized (Discord code 40001)',
		)
	}
})

test('other endpoints and other status codes keep the original handling', () => {
	const unrelated = { url: '/auth/logout' }
	expect(protectQuestRequest('post', unrelated)).toBe(unrelated)
	const alreadyHandled = { url: '/quests/@me', interceptResponse: () => true }
	expect(
		protectQuestRequest('get', alreadyHandled).interceptResponse?.(
			{ status: 403 },
			undefined,
			undefined,
		),
	).toBe(true)
})
