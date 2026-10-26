import type { Quest } from '../quests/model'

export type CompletionState =
	| { kind: 'queued' | 'running'; progress: number; target: number }
	| { kind: 'completed' | 'stopped'; message: string }
	| { kind: 'error'; message: string }

type Task = Quest['tasks'][number]
export type CompletionAdapter = {
	allowed?(): boolean
	account(): string | undefined
	foreground(): boolean
	quest(id: string): Quest | undefined
	supports(task: Task): boolean
	video(id: string, progress: number): Promise<unknown>
	heartbeat(
		id: string,
		applicationId: string,
		terminal: boolean,
	): Promise<unknown>
	now(): number
	wallNow?(): number
	options?(): { simultaneous: boolean; accelerateVideo: boolean }
	wait(ms: number, signal: AbortSignal): Promise<void>
}

export function completionTask(quest: Quest): Task | undefined {
	if (quest.status !== 'active') return
	return quest.tasks.find(
		task =>
			[
				'WATCH_VIDEO',
				'WATCH_VIDEO_ON_MOBILE',
				'PLAY_ON_DESKTOP',
				'PLAY_ACTIVITY',
			].includes(task.name) && task.progress < task.target,
	)
}

export function createCompletionController(adapter: CompletionAdapter) {
	const entries = new Map<
		string,
		{ account: string; state: CompletionState; abort: AbortController }
	>()
	const checkpoints = new Map<string, number>()
	const progressKey = (account: string, id: string, task: Task) =>
		JSON.stringify([account, id, task.name])
	const resumeProgress = (account: string, id: string, task: Task) =>
		Math.min(
			task.target,
			Math.max(
				task.progress,
				checkpoints.get(progressKey(account, id, task)) ?? 0,
			),
		)
	const listeners = new Set<() => void>()
	let enabled = false
	type Entry = {
		account: string
		state: CompletionState
		abort: AbortController
	}
	const executing = new Map<Entry, string>()
	let revision = 0
	const emit = () => {
		revision++
		for (const listener of listeners) listener()
	}
	const valid = (entry: { account: string; abort: AbortController }) =>
		enabled &&
		!entry.abort.signal.aborted &&
		adapter.foreground() &&
		adapter.account() === entry.account

	async function run(
		id: string,
		entry: { account: string; state: CompletionState; abort: AbortController },
	) {
		const quest = adapter.quest(id)
		const task = quest && completionTask(quest)
		if (!task || !adapter.supports(task))
			throw new Error(
				'This quest type is not supported by this Discord version.',
			)
		const accelerated =
			adapter.options?.().accelerateVideo &&
			(task.name === 'WATCH_VIDEO' || task.name === 'WATCH_VIDEO_ON_MOBILE') &&
			typeof quest.enrolledAt === 'number' &&
			Number.isFinite(quest.enrolledAt)
		const checkpointKey = progressKey(entry.account, id, task)
		const initialProgress = resumeProgress(entry.account, id, task)
		let progress = accelerated
			? Math.min(
					task.target,
					Math.max(
						initialProgress,
						((adapter.wallNow?.() ?? Date.now()) - quest.enrolledAt!) / 1000,
					),
				)
			: initialProgress
		let lastProgress = progress
		let stalled = 0
		let firstPlayReport = true
		const video =
			task.name === 'WATCH_VIDEO' || task.name === 'WATCH_VIDEO_ON_MOBILE'
		while (valid(entry)) {
			const current = adapter.quest(id)
			if (!current || current.status === 'expired')
				throw new Error('Quest is no longer available.')
			if (current.status === 'completed' || current.status === 'claimed') {
				entry.state = {
					kind: 'completed',
					message: 'Completed. Claim your reward in Discord.',
				}
				emit()
				return
			}
			if (current.status !== 'active')
				throw new Error('Accept this quest in Discord first.')
			entry.state = { kind: 'running', progress, target: task.target }
			emit()
			const before = adapter.now()
			await adapter.wait(
				video
					? Math.min(7000, Math.max(1000, (task.target - progress) * 1000))
					: firstPlayReport
						? 0
						: 20000,
				entry.abort.signal,
			)
			if (!valid(entry)) break
			firstPlayReport = false
			if (video) {
				// Cap each report to foreground time; never catch up after suspension.
				progress = Math.min(
					task.target,
					progress + Math.min(7, Math.max(0, (adapter.now() - before) / 1000)),
				)
				await adapter.video(id, progress)
				checkpoints.set(checkpointKey, progress)
			} else {
				if (!task.applicationId)
					throw new Error('Quest application is unavailable.')
				await adapter.heartbeat(id, task.applicationId, false)
			}
			if (!valid(entry)) break
			await adapter.wait(1000, entry.abort.signal)
			const updated = adapter.quest(id)
			if (updated?.status === 'completed' || updated?.status === 'claimed') {
				if (!video && task.applicationId && valid(entry))
					await adapter.heartbeat(id, task.applicationId, true)
				if (!valid(entry)) break
				entry.state = {
					kind: 'completed',
					message: 'Completed. Claim your reward in Discord.',
				}
				emit()
				return
			}
			const confirmed =
				updated?.tasks.find(item => item.name === task.name)?.progress ??
				lastProgress
			stalled =
				confirmed > lastProgress || (video && progress < task.target)
					? 0
					: stalled + 1
			lastProgress = Math.max(lastProgress, confirmed)
			progress = Math.max(progress, confirmed)
			checkpoints.set(checkpointKey, progress)
			if (stalled >= 4)
				throw new Error(
					'Discord did not confirm progress. Stopped; reopen Quests before retrying.',
				)
		}
		entry.state = {
			kind: 'stopped',
			message: 'Stopped. Start again to resume.',
		}
		emit()
	}

	function schedule() {
		if (!enabled) return
		const simultaneous = adapter.options?.().simultaneous ?? false
		if (!simultaneous && executing.size > 0) return
		for (const [id, entry] of entries) {
			if (entry.state.kind !== 'queued' || [...executing.values()].includes(id))
				continue
			if (!valid(entry)) {
				stop(id)
				continue
			}
			entry.state = { ...entry.state, kind: 'running' }
			executing.set(entry, id)
			emit()
			void run(id, entry)
				.catch(error => {
					entry.state = entry.abort.signal.aborted
						? { kind: 'stopped', message: 'Stopped.' }
						: {
								kind: 'error',
								message:
									error instanceof Error ? error.message : 'Completion failed.',
							}
					emit()
				})
				.finally(() => {
					executing.delete(entry)
					schedule()
				})
			if (!simultaneous) break
		}
	}

	function stop(id: string) {
		const entry = entries.get(id)
		if (!entry || !['running', 'queued'].includes(entry.state.kind)) return
		entry.abort.abort()
		entry.state = { kind: 'stopped', message: 'Stopped.' }
		emit()
	}
	return {
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot: () => revision,
		state: (id: string) => {
			const entry = entries.get(id)
			return entry && entry.account === adapter.account()
				? entry.state
				: undefined
		},
		start() {
			enabled = true
		},
		stop,
		reschedule: schedule,
		pending() {
			return [...entries]
				.filter(
					([, entry]) =>
						entry.state.kind === 'queued' || entry.state.kind === 'running',
				)
				.map(([questId, entry]) => ({ questId, account: entry.account }))
		},
		canComplete(quest: Quest) {
			return quest.tasks.some(
				task =>
					[
						'WATCH_VIDEO',
						'WATCH_VIDEO_ON_MOBILE',
						'PLAY_ON_DESKTOP',
						'PLAY_ACTIVITY',
					].includes(task.name) && adapter.supports(task),
			)
		},
		canQueue(quest: Quest) {
			const task = completionTask(quest)
			return !!task && adapter.supports(task)
		},
		stopAll() {
			for (const id of entries.keys()) stop(id)
		},
		dispose() {
			enabled = false
			for (const id of entries.keys()) stop(id)
			entries.clear()
			emit()
		},
		check() {
			for (const [id, entry] of entries) if (!valid(entry)) stop(id)
		},
		queue(quest: Quest) {
			if (adapter.allowed?.() === false)
				throw new Error(
					'Enable Allow auto-completion in Questify settings before starting a quest.',
				)
			const account = adapter.account()
			const task = completionTask(quest)
			if (!enabled || !account || !adapter.foreground())
				throw new Error('Keep Discord open and signed in to complete quests.')
			if (quest.status !== 'active')
				throw new Error('Accept this quest in Discord first.')
			if (!task)
				throw new Error(
					`No supported incomplete task found: ${quest.tasks.map(task => task.name).join(', ') || 'no tasks'}.`,
				)
			if (!adapter.supports(task))
				throw new Error(
					`Could not find Discord's ${task.name} action. Open the quest's detail screen, then retry.`,
				)
			const previous = entries.get(quest.id)
			if (previous && ['running', 'queued'].includes(previous.state.kind))
				return
			entries.set(quest.id, {
				account,
				state: {
					kind: 'queued',
					progress: resumeProgress(account, quest.id, task),
					target: task.target,
				},
				abort: new AbortController(),
			})
			emit()
			schedule()
		},
	}
}
