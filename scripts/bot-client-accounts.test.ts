import { expect, test } from 'bun:test'
import { saveAccount } from '../plugins/bot-client/accounts'
import type {
	AccountStorage,
	SavedAccount,
} from '../plugins/bot-client/accounts'

test('saves more than five accounts and refreshes tokens without duplicates', async () => {
	let data: AccountStorage = { accounts: [] }
	const storage = {
		get: async () => data,
		set: async (value: Partial<AccountStorage>) => {
			data = { ...data, ...value }
		},
	}
	for (let index = 0; index < 8; index++) {
		await saveAccount(storage, {
			id: String(index),
			username: `Account ${index}`,
			bot: index % 2 === 0,
			token: `token-${index}`,
		})
	}
	expect(data.accounts).toHaveLength(8)
	const updated: SavedAccount = {
		id: '0',
		username: 'Renamed',
		bot: true,
		token: 'new-token',
	}
	await saveAccount(storage, updated)
	expect(data.accounts).toHaveLength(8)
	expect(data.accounts[0]).toEqual(updated)
})

test('does not overwrite account data when storage cannot be loaded', async () => {
	let writes = 0
	const storage = {
		get: async (): Promise<AccountStorage> => {
			throw new Error('Read failed')
		},
		set: async () => {
			writes++
		},
	}
	await expect(
		saveAccount(storage, {
			id: '1',
			username: 'User',
			bot: false,
			token: 'token',
		}),
	).rejects.toThrow('Read failed')
	expect(writes).toBe(0)
})

test('renders custom avatars and default avatars for older saved accounts', async () => {
	const { accountAvatarUrl } = await import('../plugins/bot-client/accounts')
	expect(accountAvatarUrl({ id: '123', avatar: 'avatarhash' })).toBe(
		'https://cdn.discordapp.com/avatars/123/avatarhash.png?size=80',
	)
	expect(accountAvatarUrl({ id: '123' })).toBe(
		'https://cdn.discordapp.com/embed/avatars/0.png',
	)
})

test('recovers saved bot identity from the token even when the stored flag is false', async () => {
	const { isBotAccount } = await import('../plugins/bot-client/accounts')
	expect(isBotAccount({ bot: false, token: 'Bot saved-token' })).toBe(true)
	expect(isBotAccount({ bot: false, token: 'normal-token' })).toBe(false)
	let data: AccountStorage = { accounts: [] }
	await saveAccount(
		{
			get: async () => data,
			set: async value => {
				data = { ...data, ...value }
			},
		},
		{ id: '123', username: 'Bot', bot: false, token: 'Bot saved-token' },
	)
	expect(data.accounts[0]?.bot).toBe(true)
})
