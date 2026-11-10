import type { Session } from './sessions'

export type LogoutResult = {
	removed: string[]
	failed: string[]
	mfa: boolean
}

function isMfaChallenge(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false
	if ('mfa' in value && value.mfa === true) return true
	if ('code' in value && value.code === 60003) return true
	if (
		'body' in value &&
		typeof value.body === 'object' &&
		value.body !== null
	) {
		return (
			('mfa' in value.body && value.body.mfa === true) ||
			('code' in value.body && value.body.code === 60003)
		)
	}
	return false
}

export async function logOutSessions({
	hashes,
	getSessions,
	request,
	refresh,
	reportError,
	isActive = () => true,
}: {
	hashes: readonly string[]
	getSessions: () => Session[]
	request: (hashes: string[]) => Promise<unknown>
	refresh: () => Promise<unknown>
	reportError: (error: unknown) => void
	isActive?: () => boolean
}): Promise<LogoutResult> {
	const result: LogoutResult = { removed: [], failed: [], mfa: false }
	const requested = [...new Set(hashes)]
	for (const [index, hash] of requested.entries()) {
		if (!isActive()) {
			result.failed.push(...requested.slice(index))
			break
		}
		const session = getSessions().find(session => session.id_hash === hash)
		if (!session || session.current) {
			result.failed.push(hash)
			continue
		}
		try {
			const body = await request([hash])
			if (isMfaChallenge(body)) {
				result.mfa = true
				result.failed.push(...requested.slice(index))
				break
			}
			result.removed.push(hash)
		} catch (error) {
			if (isMfaChallenge(error)) {
				result.mfa = true
				result.failed.push(...requested.slice(index))
				break
			}
			reportError(error)
			result.failed.push(hash)
		}
	}
	if (isActive()) {
		try {
			await refresh()
		} catch (error) {
			reportError(error)
		}
	}
	return result
}
