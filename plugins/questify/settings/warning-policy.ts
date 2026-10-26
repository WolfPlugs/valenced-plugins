import { normalizeSettings } from './config'
import type { Settings } from './config'

export const WarningVersion = 1
export const PolicyUrl =
	'https://discord.com/safety/platform-manipulation-policy-explainer'
export const UsageWarning =
	'Discord prohibits using scripts or plugins to simulate quest completion without doing the required activity. Using auto-completion can lead to loss of quest and reward access, account-standing violations, or other account action. No Questify setting guarantees safety or avoids detection.\n\nAcceleration, simultaneous completion, and preventing focus pauses change normal quest behavior. Automatic types and resume can send progress reports without another button press. You are responsible for choosing whether to use these features.'
export const SettingWarnings: Record<string, string> = {
	accelerateVideo:
		'Acceleration reports video progress using elapsed enrollment time. This changes normal viewing behavior and can result in rejected progress or enforcement.',
	preventVideoPausing:
		'This keeps the quest video from pausing when its screen loses focus. It changes normal viewing behavior; Android may still suspend background playback.',
	simultaneous:
		'Several quests will send progress requests at the same time. This can trigger rate limits and does not reduce detection or account risk.',
	resumeInterrupted:
		'Saved quests can resume sending requests after a reload, restart, or return to Discord, without asking you to start each quest again.',
	autoTypes:
		'Accepted quests of this type will start automatically while Questify is running. They can send progress requests without another button press.',
}
export function completionAllowed(
	settings: Pick<Settings, 'warningVersion' | 'autoCompletionAllowed'>,
): boolean {
	return settings.warningVersion > 0 && settings.autoCompletionAllowed
}
export function displayOnlySettings(settings: Settings): Settings {
	return {
		...normalizeSettings(settings),
		warningVersion: WarningVersion,
		autoCompletionAllowed: false,
		accelerateVideo: false,
		preventVideoPausing: false,
		simultaneous: false,
		resumeInterrupted: false,
		autoTypes: {},
		resumeByAccount: {},
	}
}
