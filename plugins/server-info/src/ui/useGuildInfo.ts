import { React } from '@valenced/react'
import { useReRender } from '@valenced/utils/react'
import {
	forceLoadLazySheets,
	getBasicGuildStore,
	getFetchBasicGuild,
	getGuildChannelStore,
	getGuildHeaderCountsStore,
	getGuildMemberCountStore,
	getGuildMemberStore,
	getGuildRoleStore,
	getGuildStore,
	getHTTPUtils,
	getRelationshipStore,
	getRequestMembersById,
	getUserStore,
	reportModuleError,
} from '../lib/modules'

export interface GuildInfo {
	guild: any
	isLoading: boolean
	ownerId: string | null
	ownerDisplayName: string | null
	ownerAvatarUri: string | undefined
	iconUri: string | undefined
	bannerUri: string | undefined
	memberCount: number | undefined
	onlineCount: number | undefined
	roleCount: number | undefined
	channelCount: number | undefined
	boostLabel: string | undefined
	premiumTier: number
	createdLabel: string | undefined
	friends: Array<{
		userId: string
		displayName: string
		avatarHash: string | undefined
		nick: string | undefined
	}>
}

export function useGuildInfo(guildId: string): GuildInfo {
	const forceUpdate = useReRender()

	const [profileOwnerId, setProfileOwnerId] = React.useState<string | null>(
		null,
	)
	const [ownerName, setOwnerName] = React.useState<string | null>(null)
	const [ownerAvatar, setOwnerAvatar] = React.useState<string | null>(null)

	React.useEffect(() => {
		const stores = [
			getGuildStore(),
			getUserStore(),
			getGuildRoleStore(),
			getGuildChannelStore(),
			getGuildMemberCountStore(),
			getGuildHeaderCountsStore(),
			getBasicGuildStore(),
			getGuildMemberStore(),
			getRelationshipStore(),
		].filter(Boolean)
		for (const store of stores) store.addChangeListener(forceUpdate)

		const guildStore = getGuildStore()
		const basicGuildStore = getBasicGuildStore()
		const guildData = guildStore?.getGuild(guildId)
		const basicGuildData = basicGuildStore?.getGuild?.(guildId)
		const guildStatus = guildStore?.getGuildOrStatus?.(guildId)

		if (!guildData && !basicGuildData && guildStatus?.type !== 'loading') {
			getFetchBasicGuild()?.(guildId)
		}

		return () => {
			for (const store of stores) store.removeChangeListener(forceUpdate)
		}
	}, [forceUpdate, guildId])

	React.useEffect(() => {
		const requestMembersById = getRequestMembersById()
		const friendIds = getRelationshipStore()?.getFriendIDs?.() ?? []
		if (requestMembersById && friendIds.length > 0) {
			requestMembersById(guildId, friendIds, false)
		}
	}, [guildId])

	React.useEffect(() => {
		forceLoadLazySheets()
	}, [])

	React.useEffect(() => {
		if (profileOwnerId) return

		const fullGuild = getGuildStore()?.getGuild(guildId)
		if (fullGuild?.ownerId) {
			setProfileOwnerId(fullGuild.ownerId)
			return
		}

		let cancelled = false
		let retry: ReturnType<typeof setTimeout> | undefined

		const resolve = () => {
			const fullGuild = getGuildStore()?.getGuild(guildId)
			if (fullGuild?.ownerId) {
				setProfileOwnerId(fullGuild.ownerId)
				return
			}

			const http = getHTTPUtils()
			if (http?.get) {
				http
					.get(`/guilds/${guildId}`)
					.then((res: any) => {
						if (!cancelled && res?.body?.owner_id) {
							setProfileOwnerId(res.body.owner_id)
						}
					})
					.catch(reportModuleError)
			} else {
				retry = setTimeout(resolve, 400)
			}
		}
		resolve()

		return () => {
			cancelled = true
			clearTimeout(retry)
		}
	}, [guildId, profileOwnerId])

	React.useEffect(() => {
		if (!profileOwnerId || ownerName) return

		let cancelled = false
		let retry: ReturnType<typeof setTimeout> | undefined

		const resolve = () => {
			const user = getUserStore()?.getUser(profileOwnerId)
			if (user?.globalName || user?.username) {
				setOwnerName(user.globalName ?? user.username)
				if (user.avatar) setOwnerAvatar(user.avatar)
				return
			}

			const http = getHTTPUtils()
			if (http?.get) {
				http
					.get(`/users/${profileOwnerId}`)
					.then((res: any) => {
						const body = res?.body
						if (!cancelled && body?.username) {
							setOwnerName(body.global_name ?? body.username)
							if (body.avatar) setOwnerAvatar(body.avatar)
						}
					})
					.catch(reportModuleError)
			} else {
				retry = setTimeout(resolve, 400)
			}
		}
		resolve()

		return () => {
			cancelled = true
			clearTimeout(retry)
		}
	}, [profileOwnerId, ownerName])

	const fullGuild = getGuildStore()?.getGuild(guildId)
	const basicGuild =
		getBasicGuildStore()?.getGuild?.(guildId) ??
		getBasicGuildStore()?.getGuildOrStatus?.(guildId)
	const guild = fullGuild ?? basicGuild
	const guildStatus = getGuildStore()?.getGuildOrStatus?.(guildId)
	const isLoading = guildStatus?.type === 'loading'

	const icon: string | null = guild?.icon ?? null
	const banner: string | null = guild?.banner ?? null
	const ownerId: string | null = guild?.ownerId ?? profileOwnerId

	const iconUri = icon
		? `https://cdn.discordapp.com/icons/${guild?.id}/${icon}?size=128`
		: undefined
	const bannerUri = banner
		? `https://cdn.discordapp.com/banners/${guild?.id}/${banner}?size=1024`
		: undefined

	const owner = ownerId ? getUserStore()?.getUser(ownerId) : null
	const ownerDisplayName = owner?.globalName ?? owner?.username ?? ownerName

	const ownerAvatarHash = ownerAvatar ?? owner?.avatar
	const ownerAvatarUri = ownerAvatarHash
		? `https://cdn.discordapp.com/avatars/${ownerId}/${ownerAvatarHash}?size=64`
		: undefined

	const memberCountStore = getGuildMemberCountStore()
	const headerCountsStore = getGuildHeaderCountsStore()
	const memberCount =
		memberCountStore?.getMemberCount?.(guildId) ?? guild?.memberCount
	const onlineCount = headerCountsStore?.getOnlineCount?.(guildId)
	const roleCount = getGuildRoleStore()?.getSortedRoles?.(guildId)?.length
	const channelCount = Object.keys(
		getGuildChannelStore()?.getChannels?.(guildId) ?? {},
	).length

	const friendIds: string[] = getRelationshipStore()?.getFriendIDs?.() ?? []

	const guildMemberStore = getGuildMemberStore()
	const userStore = getUserStore()
	const friendsInGuild = friendIds
		.filter(id => guildMemberStore?.getMember?.(guildId, id) != null)
		.map(id => {
			const member = guildMemberStore?.getMember?.(guildId, id)
			const user = userStore?.getUser?.(id)
			return {
				userId: id,
				displayName: user?.globalName ?? user?.username ?? 'Unknown',
				avatarHash: user?.avatar,
				nick: member?.nick,
			}
		})

	const premiumTier: number = guild?.premiumTier ?? 0
	const boostCount: number | null | undefined = guild?.premiumSubscriptionCount
	const boostLabel =
		boostCount != null && boostCount > 0
			? `${boostCount.toLocaleString()} boost${boostCount === 1 ? '' : 's'}`
			: undefined

	const created = guild
		? new Date(Number((BigInt(guild.id) >> 22n) + 1420070400000n))
		: null
	const createdLabel = created?.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})

	return {
		guild,
		isLoading,
		ownerId,
		ownerDisplayName,
		ownerAvatarUri,
		iconUri,
		bannerUri,
		memberCount,
		onlineCount,
		roleCount,
		channelCount,
		boostLabel,
		premiumTier,
		createdLabel,
		friends: friendsInGuild,
	}
}
