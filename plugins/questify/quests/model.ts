export type QuestStatus =
	| 'available'
	| 'active'
	| 'completed'
	| 'claimed'
	| 'expired'
export type Quest = {
	id: string
	name: string
	expiresAt: number
	enrolledAt?: number
	status: QuestStatus
	tasks: {
		name: string
		progress: number
		target: number
		applicationId?: string
	}[]
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function date(value: unknown): number {
	return typeof value === 'string' ? Date.parse(value) : Number.NaN
}

export function parseQuests(value: unknown, now = Date.now()): Quest[] {
	const entries =
		value instanceof Map
			? [...value.values()]
			: Array.isArray(value)
				? value
				: record(value)
					? Object.values(value)
					: []
	return entries.flatMap((entry: unknown): Quest[] => {
		if (!record(entry) || typeof entry.id !== 'string' || !record(entry.config))
			return []
		const config = entry.config
		const messages = record(config.messages) ? config.messages : {}
		const status = record(entry.userStatus)
			? entry.userStatus
			: record(entry.user_status)
				? entry.user_status
				: {}
		const expiresAt = date(config.expiresAt ?? config.expires_at)
		const taskConfig =
			config.taskConfigV2 ??
			config.task_config_v2 ??
			config.taskConfig ??
			config.task_config
		const tasks =
			record(taskConfig) && record(taskConfig.tasks) ? taskConfig.tasks : {}
		const progress = record(status.progress) ? status.progress : {}
		return [
			{
				id: entry.id,
				name:
					typeof messages.questName === 'string'
						? messages.questName
						: typeof messages.quest_name === 'string'
							? messages.quest_name
							: entry.id,
				expiresAt,
				enrolledAt: date(status.enrolledAt ?? status.enrolled_at),
				status:
					status.claimedAt || status.claimed_at
						? 'claimed'
						: status.completedAt || status.completed_at
							? 'completed'
							: expiresAt <= now
								? 'expired'
								: status.enrolledAt || status.enrolled_at
									? 'active'
									: 'available',
				tasks: Object.entries(tasks).flatMap(([name, task]) => {
					if (
						!record(task) ||
						typeof task.target !== 'number' ||
						!Number.isFinite(task.target) ||
						task.target <= 0
					)
						return []
					const item = progress[name]
					const amount = record(item) ? item.value : undefined
					return [
						{
							name,
							applicationId:
								Array.isArray(task.applications) &&
								record(task.applications[0]) &&
								typeof task.applications[0].id === 'string'
									? task.applications[0].id
									: record(config.application) &&
											typeof config.application.id === 'string'
										? config.application.id
										: undefined,
							target: task.target,
							progress:
								typeof amount === 'number' && Number.isFinite(amount)
									? Math.max(0, amount)
									: 0,
						},
					]
				}),
			},
		]
	})
}
