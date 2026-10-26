function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export function questRequestError(error: unknown): Error {
	if (!record(error)) return new Error('Discord quest request failed.')
	const body = record(error.body) ? error.body : {}
	const status = typeof error.status === 'number' ? ` HTTP ${error.status}` : ''
	const message =
		typeof body.message === 'string'
			? body.message
			: typeof error.message === 'string'
				? error.message
				: 'Request failed.'
	return new Error(`Discord quest request failed${status}: ${message}`)
}

export async function callQuestAction(
	action: () => Promise<unknown>,
): Promise<void> {
	try {
		// Discord's native quest actions return void after awaiting their request.
		await action()
	} catch (error) {
		throw questRequestError(error)
	}
}

type QuestDispatcher = {
	subscribe(event: string, listener: (payload: unknown) => void): void
	unsubscribe(event: string, listener: (payload: unknown) => void): void
}

export function callQuestHeartbeat(
	dispatcher: QuestDispatcher,
	questId: string,
	send: () => Promise<unknown>,
): Promise<void> {
	return new Promise((resolve, reject) => {
		let settled = false
		const finish = (error?: Error) => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			dispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', success)
			dispatcher.unsubscribe('QUESTS_SEND_HEARTBEAT_FAILURE', failure)
			if (error) reject(error)
			else resolve()
		}
		const success = (payload: unknown) => {
			if (record(payload) && payload.questId === questId) finish()
		}
		const failure = (payload: unknown) => {
			if (record(payload) && payload.questId === questId)
				finish(questRequestError(payload.error))
		}
		const timer = setTimeout(
			() =>
				finish(new Error('Discord did not acknowledge this quest heartbeat.')),
			15000,
		)
		dispatcher.subscribe('QUESTS_SEND_HEARTBEAT_SUCCESS', success)
		dispatcher.subscribe('QUESTS_SEND_HEARTBEAT_FAILURE', failure)
		try {
			void send().catch(error => finish(questRequestError(error)))
		} catch (error) {
			finish(questRequestError(error))
		}
	})
}
