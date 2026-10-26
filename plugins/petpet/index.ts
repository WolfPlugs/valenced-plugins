import { ToastActionCreators } from '@valenced/discord/actions'
import { withStoreName } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { attachPetPet } from './attachments'
import { registerPetPet } from './command'
import { decodePNG, renderPetPet } from './render'

function commandInput(args: unknown, context: unknown) {
	if (!Array.isArray(args)) throw new Error('Select a user with /petpet user.')
	const option: unknown = args.find(
		(option: unknown) =>
			typeof option === 'object' &&
			option !== null &&
			'name' in option &&
			option.name === 'user',
	)
	if (
		typeof option !== 'object' ||
		option === null ||
		!('value' in option) ||
		typeof option.value !== 'string' ||
		!/^\d+$/.test(option.value)
	)
		throw new Error('Select a user with /petpet user.')
	if (
		typeof context !== 'object' ||
		context === null ||
		!('channel' in context) ||
		typeof context.channel !== 'object' ||
		context.channel === null ||
		!('id' in context.channel) ||
		typeof context.channel.id !== 'string'
	)
		throw new Error('Could not find the message channel.')
	return { userId: option.value, channelId: context.channel.id }
}

function avatarURL(userId: string) {
	const [users] = lookupModule(
		withStoreName<{ getUser(id: string): unknown }>('UserStore'),
	)
	const user = users?.getUser(userId)
	if (typeof user !== 'object' || user === null)
		throw new Error('Could not find the selected user.')
	if (
		'avatar' in user &&
		typeof user.avatar === 'string' &&
		/^[a-zA-Z0-9_]+$/.test(user.avatar)
	)
		return `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=128`
	const discriminator = 'discriminator' in user ? Number(user.discriminator) : 0
	let defaultAvatar = 0
	for (const digit of userId)
		defaultAvatar = (defaultAvatar * 10 + Number(digit)) % (6 * 2 ** 22)
	defaultAvatar = discriminator
		? discriminator % 5
		: Math.floor(defaultAvatar / 2 ** 22)
	return `https://cdn.discordapp.com/embed/avatars/${defaultAvatar}.png?size=128`
}

export default plugin({
	start({ cleanup, plugin }) {
		let active: AbortController | undefined
		cleanup(() => {
			active?.abort()
			active = undefined
		})
		cleanup(
			registerPetPet(cleanup, async (args, context) => {
				if (active) {
					ToastActionCreators.open('PETPET_BUSY', {
						text: 'A PetPet GIF is already being generated.',
					})
					return
				}
				const controller = new AbortController()
				active = controller
				const timeout = setTimeout(() => controller.abort(), 30_000)
				try {
					const { userId, channelId } = commandInput(args, context)
					const response = await fetch(avatarURL(userId), {
						signal: controller.signal,
					})
					if (!response.ok)
						throw new Error('Could not download the selected avatar.')
					if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024)
						throw new Error('The avatar image is too large.')
					const buffer = await response.arrayBuffer()
					if (buffer.byteLength > 2 * 1024 * 1024)
						throw new Error('The avatar image is too large.')
					const bytes = await renderPetPet(decodePNG(buffer), controller.signal)
					const [channels] = lookupModule(
						withStoreName<{ getChannelId(): unknown }>('SelectedChannelStore'),
					)
					if (!channels)
						throw new Error('Could not check the current message channel.')
					const isCurrent = () =>
						active === controller &&
						!controller.signal.aborted &&
						channels.getChannelId() === channelId
					if (!isCurrent())
						throw new Error(
							'Channel changed. Run /petpet again in the destination channel.',
						)
					await attachPetPet(bytes, channelId, isCurrent)
				} catch (error) {
					if (active !== controller) return
					plugin.reportError(error)
					ToastActionCreators.open('PETPET_ERROR', {
						text: controller.signal.aborted
							? 'PetPet generation timed out. Try again.'
							: error instanceof Error
								? error.message
								: 'Could not generate the PetPet GIF.',
						variant: 'critical',
					})
				} finally {
					clearTimeout(timeout)
					if (active === controller) active = undefined
				}
			}),
		)
	},
})
