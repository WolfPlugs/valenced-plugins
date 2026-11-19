import { expect, test } from 'bun:test'
import { RUN_SCRIPT } from '../plugins/questify/webrunner/script'

test('injected script completes an enrolled video quest through the web api', async () => {
	const posts: { url: string; body: unknown }[] = []
	const messages: { type: string; data: unknown }[] = []
	const quest = {
		id: '42',
		config: {
			expiresAt: new Date(Date.now() + 1e7).toISOString(),
			messages: { questName: 'Watch it' },
			taskConfig: { tasks: { WATCH_VIDEO: { target: 1 } } },
		},
		userStatus: { enrolledAt: '2026-01-01', progress: {} },
	}
	const modules: Record<string, { exports: unknown }> = {
		quests: {
			exports: {
				A: Object.assign(Object.create({ getQuest() {} }), {
					quests: new Map([['42', quest]]),
				}),
			},
		},
		api: {
			exports: {
				A: {
					Bo: {
						get() {},
						async post(request: { url: string; body: unknown }) {
							posts.push(request)
							return { body: { completed_at: null } }
						},
					},
				},
			},
		},
	}
	for (let i = 0; i < 10; i++) modules[`filler${i}`] = { exports: {} }
	const window: Record<string, unknown> = {
		ReactNativeWebView: {
			postMessage: (raw: string) => messages.push(JSON.parse(raw)),
		},
		webpackChunkdiscord_app: {
			push: () => ({ c: modules }),
			pop() {},
		},
	}
	new Function('window', RUN_SCRIPT)(window)
	for (let i = 0; i < 50 && !messages.some(m => m.type === 'status'); i++)
		await new Promise(resolve => setTimeout(resolve, 50))
	expect(posts.map(post => post.url)).toEqual([
		'/quests/42/video-progress',
		'/quests/42/video-progress',
	])
	expect(messages.at(-1)).toEqual({
		type: 'status',
		data: 'All quests finished.',
	})
})
