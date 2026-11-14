import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { callNativeMethod } from '@valenced/modules/native'
import { currentAccount } from '../quests/store'
import { protectUnauthorized } from './requests'
import type { QuestHTTPOptions } from './requests'

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'wolfie.questify.activityAchievement': [
			[
				appId: string,
				questId: string,
				code: string,
				target: number,
				ticket: string,
			],
			void,
		]
	}
}

type HTTP = Record<
	'get' | 'post' | 'del',
	(options: QuestHTTPOptions) => Promise<{ body: unknown }>
>
const busy = new Set<string>()

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export async function completeActivityAchievement(
	appId: string,
	questId: string,
	target: number,
	active: () => boolean,
) {
	if (
		![appId, questId].every(id => /^[1-9]\d{4,19}$/.test(id)) ||
		!Number.isSafeInteger(target) ||
		target < 1
	)
		throw new Error('Invalid Activity achievement quest.')
	const account = currentAccount()
	const http = lookupModuleWithImportedPath<{ HTTP?: HTTP }>(
		'../discord_common/js/packages/http-utils/HTTPUtils.tsx',
	)[0]?.HTTP
	if (!http || !account)
		throw new Error('Open Quests while signed in, then retry.')
	const key = `${account}:${appId}`
	if (busy.has(key))
		throw new Error('An achievement for this Activity is already running.')
	busy.add(key)

	async function grantId() {
		const { body } =
			(await http?.get(protectUnauthorized({ url: '/oauth2/tokens' }))) ?? {}
		if (
			!Array.isArray(body) ||
			!body.every(
				item =>
					record(item) &&
					typeof item.id === 'string' &&
					record(item.application) &&
					typeof item.application.id === 'string',
			)
		)
			throw new Error('Could not verify existing Activity authorization.')
		const grant = body.find(item => item.application.id === appId)
		return typeof grant?.id === 'string' ? grant.id : undefined
	}

	let createdGrant = false
	let failure: Error | undefined
	let stage = 'checking authorization'
	try {
		const existingGrant = await grantId()
		if (!active()) return
		stage = 'obtaining the Activity proxy ticket'
		const { body: ticketResponse } = await http.post(
			protectUnauthorized({
				url: `/applications/${appId}/proxy-tickets`,
				body: {},
			}),
		)
		const ticket =
			typeof ticketResponse === 'string'
				? ticketResponse
				: record(ticketResponse)
					? ticketResponse.ticket
					: undefined
		if (
			typeof ticket !== 'string' ||
			ticket.length === 0 ||
			ticket.length > 8192 ||
			/[^\x21-\x7e]/.test(ticket)
		)
			throw new Error('Discord returned no usable Activity proxy ticket.')
		if (!active() || currentAccount() !== account) return
		stage = 'authorizing the Activity'
		const query = new URLSearchParams({
			client_id: appId,
			response_type: 'code',
			scope: 'identify applications.entitlements',
			state: '',
		})
		const { body } = await http.post(
			protectUnauthorized({
				url: `/oauth2/authorize?${query}`,
				body: { authorize: true },
			}),
		)
		createdGrant = !existingGrant
		let code: string | null = null
		if (record(body) && typeof body.location === 'string') {
			try {
				code = new URL(body.location).searchParams.get('code')
			} catch {}
		}
		if (!code || !/^[A-Za-z0-9]+$/.test(code))
			throw new Error('Discord did not return an Activity authorization code.')
		stage = 'submitting Activity progress'
		if (active() && currentAccount() === account)
			await callNativeMethod('wolfie.questify.activityAchievement', [
				appId,
				questId,
				code,
				target,
				ticket,
			])
	} catch (error) {
		// Authorization failures may contain credentials or redirect URLs.
		const detail = record(error) && record(error.err) ? error.err : error
		const status =
			record(detail) && typeof detail.status === 'number'
				? ` (HTTP ${detail.status})`
				: error instanceof Error &&
						/Discord returned no usable Activity proxy ticket/.test(
							error.message,
						)
					? ': Discord returned no usable ticket'
					: ''
		failure = new Error(`Achievement failed while ${stage}${status}.`)
	} finally {
		try {
			if (createdGrant && currentAccount() === account) {
				const id = await grantId()
				if (id && currentAccount() === account)
					await http.del(
						protectUnauthorized({
							url: `/oauth2/tokens/${encodeURIComponent(id)}`,
						}),
					)
			}
		} catch {
			failure = new Error(
				'Could not remove Questify’s temporary grant. Check Discord’s Authorized Apps.',
			)
		} finally {
			busy.delete(key)
		}
	}
	if (failure) throw failure
}
