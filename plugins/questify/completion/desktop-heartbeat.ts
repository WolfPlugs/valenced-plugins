import { questRequestError } from './requests'

export type NativeHeartbeat = (
	questId: string,
	applicationId: string,
	terminal: boolean,
	token: string,
) => Promise<unknown>

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'wolfie.questify.heartbeat': [
			[
				questId: string,
				applicationId: string,
				terminal: boolean,
				token: string,
			],
			string,
		]
	}
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export async function sendDesktopHeartbeat(
	send: NativeHeartbeat,
	questId: string,
	applicationId: string,
	terminal: boolean,
	token: string,
): Promise<void> {
	const raw = await send(questId, applicationId, terminal, token)
	if (typeof raw !== 'string')
		throw new Error('Questify native heartbeat returned an invalid response.')
	const response: unknown = JSON.parse(raw)
	if (
		!record(response) ||
		typeof response.status !== 'number' ||
		typeof response.body !== 'string'
	)
		throw new Error('Questify native heartbeat returned an invalid response.')
	if (response.status < 200 || response.status >= 300) {
		let body: unknown
		try {
			body = JSON.parse(response.body)
		} catch {
			body = { message: 'Discord returned a non-JSON response.' }
		}
		const error = questRequestError({ status: response.status, body })
		throw new Error(`[Native heartbeat] ${error.message}`)
	}
}
