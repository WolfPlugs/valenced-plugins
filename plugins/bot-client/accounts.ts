import type { JsonStorage } from '@valenced/json-storage'

export interface SavedAccount {
	id: string
	username: string
	avatar?: string | null
	bot: boolean
	token: string
}
export function isBotAccount(account: Pick<SavedAccount, 'bot' | 'token'>) {
	return account.bot === true || /^Bot\s/i.test(account.token)
}

export type AccountStorage = { accounts: SavedAccount[] }

export async function saveAccount(
	storage: Pick<JsonStorage<AccountStorage>, 'get' | 'set'>,
	account: SavedAccount,
) {
	const data = await storage.get()
	account = { ...account, bot: isBotAccount(account) }
	const accounts = [...data.accounts]
	const index = accounts.findIndex(saved => saved.id === account.id)
	if (index < 0) accounts.push(account)
	else accounts[index] = account
	await storage.set({ accounts })
}

export function accountAvatarUrl(account: Pick<SavedAccount, 'id' | 'avatar'>) {
	if (account.avatar && /^\d+$/.test(account.id)) {
		return `https://cdn.discordapp.com/avatars/${account.id}/${encodeURIComponent(account.avatar)}.png?size=80`
	}
	const index = /^\d+$/.test(account.id)
		? Number((BigInt(account.id) >> 22n) % 6n)
		: 0
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
