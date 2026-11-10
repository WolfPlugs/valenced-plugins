import { createActivityHandlers } from './tracking/activity'
import { createMessageHandlers } from './tracking/messages'
import { createSocialHandlers } from './tracking/social'
import type { EventContext } from './tracking/shared'

export function createEventHandlers(context: EventContext) {
	const activity = createActivityHandlers(context)
	return {
		events: {
			...createMessageHandlers(context),
			...createSocialHandlers(context),
			PRESENCE_UPDATES: activity.handle,
		},
		reset: activity.reset,
	}
}
