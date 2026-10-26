export const SoundGroups = {
	ringtone: {
		label: 'Incoming ringtone',
		names: ['call_ringing'],
	},
	calling: {
		label: 'Outgoing ringing',
		names: ['call_calling'],
	},
	join: {
		label: 'Voice join',
		names: ['user_join'],
	},
	leave: {
		label: 'Voice leave',
		names: ['user_leave'],
	},
	move: {
		label: 'Voice move',
		names: ['user_moved'],
	},
	disconnect: {
		label: 'Disconnect',
		names: ['disconnect'],
	},
	reconnect: {
		label: 'Reconnect',
		names: ['reconnect'],
	},
	mute: { label: 'Mute', names: ['mute'] },
	unmute: { label: 'Unmute', names: ['unmute'] },
	deafen: { label: 'Deafen', names: ['deafen'] },
	undeafen: { label: 'Undeafen', names: ['undeafen'] },
	cameraOn: { label: 'Camera on', names: ['camera_on'] },
	cameraOff: {
		label: 'Camera off',
		names: ['camera_off'],
	},
	streamStarted: {
		label: 'Stream started',
		names: ['stream_started'],
	},
	streamEnded: {
		label: 'Stream ended',
		names: ['stream_ended'],
	},
	streamJoin: {
		label: 'Stream viewer joined',
		names: ['stream_user_joined'],
	},
	streamLeave: {
		label: 'Stream viewer left',
		names: ['stream_user_left'],
	},
	pttStart: {
		label: 'Push-to-talk start',
		names: ['ptt_start'],
	},
	pttStop: {
		label: 'Push-to-talk stop',
		names: ['ptt_stop'],
	},
	messages: {
		label: 'Message',
		names: ['message1', 'message2', 'message3'],
	},
	mentions: {
		label: 'Mention',
		names: ['mention1', 'mention2', 'mention3'],
	},
	discodo: { label: 'Discodo', names: ['discodo'] },
} satisfies Record<string, { label: string; names: string[] }>

export type Settings = {
	muted: Partial<Record<keyof typeof SoundGroups, boolean>>
}

export const DefaultSettings: Settings = {
	muted: {},
}

export function shouldMute(name: unknown, settings: unknown): boolean {
	if (
		typeof name !== 'string' ||
		typeof settings !== 'object' ||
		settings === null ||
		!('muted' in settings)
	)
		return false
	const muted = settings.muted
	if (typeof muted !== 'object' || muted === null) return false
	return Object.entries(SoundGroups).some(
		([group, { names }]) =>
			group in muted &&
			Reflect.get(muted, group) === true &&
			names.some(
				sound =>
					name === sound ||
					name === `halloween_${sound}` ||
					name === `winter_${sound}` ||
					(sound === 'call_ringing' && name === 'call_ringing_halloween') ||
					(sound === 'message1' &&
						[
							'bit_message1',
							'bop_message1',
							'ducky_message1',
							'lofi_message1',
							'asmr_message1',
						].includes(name)),
			),
	)
}
