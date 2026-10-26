import { describe, expect, it, mock } from 'bun:test'
import { authenticateBot } from '../plugins/bot-client/api'

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	})
}

describe('bot authentication', () => {
	it('uses bot authentication on both API calls and validates identity', async () => {
		const fetcher = mock<typeof fetch>()
			.mockResolvedValueOnce(
				json({ id: '123', username: 'Test Bot', bot: true }),
			)
			.mockResolvedValueOnce(json([{ id: '456', name: 'Test Server' }]))
		const result = await authenticateBot(' Bot test-token ', fetcher)
		expect(result).toEqual({
			kind: 'authenticated',
			session: {
				token: 'test-token',
				user: { id: '123', username: 'Test Bot', bot: true },
				guilds: [{ id: '456', name: 'Test Server' }],
			},
		})
		for (const [url, options] of fetcher.mock.calls) {
			expect(url.toString()).toMatch(/^https:\/\/discord\.com\/api\/v10\//)
			expect(options?.headers).toEqual({
				Authorization: 'Bot test-token',
			})
			expect(options?.credentials).toBe('omit')
		}
	})

	it('rejects non-bot accounts without loading servers', async () => {
		const fetcher = mock<typeof fetch>().mockResolvedValue(
			json({ id: '123', username: 'User', bot: false }),
		)
		expect(await authenticateBot('test-token', fetcher)).toMatchObject({
			kind: 'error',
			message: 'Only bot accounts can log in to BotClient.',
		})
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('does not request Discord for empty or malformed input', async () => {
		const fetcher = mock<typeof fetch>()
		for (const input of ['', 'Bot ', 'two tokens', 'x'.repeat(513)])
			expect(await authenticateBot(input, fetcher)).toMatchObject({
				kind: 'error',
			})
		expect(fetcher).not.toHaveBeenCalled()
	})

	it('handles invalid tokens without exposing the response body', async () => {
		const fetcher = mock<typeof fetch>().mockResolvedValue(
			json({ message: 'private token data' }, 401),
		)
		const result = await authenticateBot('test-token', fetcher)
		expect(result).toMatchObject({
			kind: 'error',
			message: 'This bot token is invalid or has been reset.',
		})
		expect(JSON.stringify(result)).not.toContain('private token data')
	})

	it('honors rate limits without retrying', async () => {
		const fetcher = mock<typeof fetch>().mockResolvedValue(
			json({ retry_after: 12.5 }, 429),
		)
		expect(await authenticateBot('test-token', fetcher)).toMatchObject({
			kind: 'error',
			retryAfterMs: 12500,
		})
		expect(fetcher).toHaveBeenCalledTimes(1)
	})

	it('rejects malformed server data', async () => {
		const fetcher = mock<typeof fetch>()
			.mockResolvedValueOnce(json({ id: '123', username: 'Bot', bot: true }))
			.mockResolvedValueOnce(json([{ id: '456', name: 42 }]))
		expect(await authenticateBot('test-token', fetcher)).toMatchObject({
			kind: 'error',
		})
	})

	it('redacts network exception text', async () => {
		const fetcher = mock<typeof fetch>().mockRejectedValue(
			new Error('private token data'),
		)
		const result = await authenticateBot('test-token', fetcher)
		expect(result).toMatchObject({ kind: 'error' })
		expect(JSON.stringify(result)).not.toContain('private token data')
	})
})

describe('normal account token authentication', () => {
	it('uses the user token directly and saves the avatar', async () => {
		const { authenticateUserToken } = await import('../plugins/bot-client/api')
		const fetcher = mock<typeof fetch>().mockResolvedValue(
			json({ id: '123', username: 'User', avatar: 'avatarhash' }),
		)
		expect(await authenticateUserToken(' user-token ', fetcher)).toEqual({
			kind: 'authenticated',
			account: {
				id: '123',
				username: 'User',
				avatar: 'avatarhash',
				bot: false,
				token: 'user-token',
			},
		})
		expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
			Authorization: 'user-token',
		})
		expect(fetcher).toHaveBeenCalledTimes(1)
	})
	it('rejects bot accounts, malformed identities, and invalid tokens', async () => {
		const { authenticateUserToken } = await import('../plugins/bot-client/api')
		for (const response of [
			json({ id: '123', username: 'Bot', bot: true }),
			json({ id: null, username: 'User' }),
			json({ message: 'secret' }, 401),
		]) {
			const result = await authenticateUserToken(
				'user-token',
				mock<typeof fetch>().mockResolvedValue(response),
			)
			expect(result.kind).toBe('error')
			expect(JSON.stringify(result)).not.toContain('secret')
		}
	})
	it('honors rate limits and aborts requests', async () => {
		const { authenticateUserToken } = await import('../plugins/bot-client/api')
		expect(
			await authenticateUserToken(
				'user-token',
				mock<typeof fetch>().mockResolvedValue(json({ retry_after: 10 }, 429)),
			),
		).toMatchObject({ kind: 'error', retryAfterMs: 10000 })
		const controller = new AbortController()
		controller.abort()
		const fetcher = mock<typeof fetch>().mockImplementation(
			async (_url, options) => {
				expect(options?.signal?.aborted).toBe(true)
				throw new Error('secret-token')
			},
		)
		const result = await authenticateUserToken(
			'user-token',
			fetcher,
			controller.signal,
		)
		expect(result.kind).toBe('error')
		expect(JSON.stringify(result)).not.toContain('secret-token')
	})
})

describe('email and password authentication', () => {
	it('saves a validated account without modifying password whitespace', async () => {
		const { authenticateCredentials } = await import(
			'../plugins/bot-client/api'
		)
		const fetcher = mock<typeof fetch>()
			.mockResolvedValueOnce(json({ token: 'user-token' }))
			.mockResolvedValueOnce(json({ id: '123', username: 'User' }))
		const result = await authenticateCredentials(
			' user@example.com ',
			' password ',
			fetcher,
		)
		expect(result.kind).toBe('authenticated')
		expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
			login: 'user@example.com',
			password: ' password ',
			undelete: false,
		})
		expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
			'Content-Type': 'application/json',
		})
		expect(JSON.stringify(result)).not.toContain('password')
	})
	it('surfaces challenges, bad credentials, and rate limits without saving or retrying', async () => {
		const { authenticateCredentials } = await import(
			'../plugins/bot-client/api'
		)
		for (const [body, status, message] of [
			[{ captcha_key: ['required'] }, 400, 'CAPTCHA'],
			[{ mfa: true, ticket: 'private' }, 200, '2FA'],
			[{ message: 'private' }, 400, 'Login failed'],
			[{ retry_after: 12 }, 429, 'rate limiting'],
		] satisfies [unknown, number, string][]) {
			const fetcher = mock<typeof fetch>().mockResolvedValue(json(body, status))
			const result = await authenticateCredentials(
				'user@example.com',
				'password',
				fetcher,
			)
			expect(result.kind).toBe('error')
			if (result.kind === 'error') expect(result.message).toContain(message)
			expect(fetcher).toHaveBeenCalledTimes(1)
			expect(JSON.stringify(result)).not.toContain('private')
		}
	})
})
