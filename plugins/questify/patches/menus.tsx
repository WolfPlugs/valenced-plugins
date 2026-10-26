import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Children, cloneElement, createElement, isValidElement } from 'react'
import { completion } from '../completion/service'
import { parseQuests } from '../quests/model'
import { readQuests } from '../quests/store'
import { isMemoQuestMenu } from './components'
import type { DiscordModules } from '@valenced/discord/types'
import type { ComponentProps } from 'react'

function QuestMenuIcon(
	props: ComponentProps<DiscordModules.Components.BaseIconImage>,
) {
	const [icons] = lookupModule(
		withProps<{ QuestsIcon: DiscordModules.Components.BaseIconImage }>(
			'QuestsIcon',
		),
	)
	return icons ? createElement(icons.QuestsIcon, props) : null
}

function completionItem(props: unknown) {
	if (typeof props !== 'object' || props === null) return
	const raw =
		'quest' in props
			? props.quest
			: 'creative' in props &&
					typeof props.creative === 'object' &&
					props.creative !== null &&
					'quest' in props.creative
				? props.creative.quest
				: undefined
	const quest = parseQuests([raw])[0]
	if (!quest || !['active', 'available'].includes(quest.status)) return
	const state = completion.state(quest.id)
	const active = state?.kind === 'queued' || state?.kind === 'running'
	return {
		key: 'questify-complete',
		label: active ? 'Stop auto-completion' : 'Auto complete quest',
		IconComponent: QuestMenuIcon,
		action: () => {
			try {
				if (active) {
					completion.stop(quest.id)
					return
				}
				const current =
					readQuests().quests.find(item => item.id === quest.id) ?? quest
				if (current.status === 'available')
					throw new Error(
						'Accept this quest in Discord first, then choose Auto complete quest.',
					)
				completion.queue(current)
				ToastActionCreators.open('QUESTIFY_STARTED', {
					text: 'Quest queued. Keep Discord open; progress is shown in Questify settings.',
				})
			} catch (error) {
				ToastActionCreators.open('QUESTIFY_ERROR', {
					text:
						error instanceof Error ? error.message : 'Could not start quest.',
					variant: 'critical',
				})
			}
		},
	}
}

function compactMenu(props: unknown, result: unknown) {
	const item = completionItem(props)
	if (!item || !isValidElement<{ items?: unknown }>(result)) return result
	const items = appendToFirstMenuGroup(result.props.items, item)
	return items === result.props.items ? result : cloneElement(result, { items })
}

function drawerMenu(props: unknown, result: unknown) {
	const item = completionItem(props)
	if (!item) return result
	return appendToDrawerGroup(
		result,
		<Design.ActionSheetRow
			key={item.key}
			label={item.label}
			icon={<Design.ActionSheetRow.Icon IconComponent={QuestMenuIcon} />}
			onPress={() => {
				ActionSheetActionCreators.hideActionSheet()
				item.action()
			}}
		/>,
	)
}

export function patchQuestMenu(cleanup: (fn: () => void) => void) {
	for (const [name, transform] of [
		['QuestContextMenu', compactMenu],
		['QuestDockContextMenuActionSheet', drawerMenu],
	] satisfies [string, (props: unknown, result: unknown) => unknown][]) {
		cleanup(
			getModules(
				withProps<{ type: unknown }>('type'),
				memo => {
					if (isMemoQuestMenu(memo, name))
						cleanup(
							instead(memo, 'type', function (args, original) {
								return transform(args[0], Reflect.apply(original, this, args))
							}),
						)
				},
				{ max: Infinity },
			),
		)
		cleanup(
			getModules(
				withName<(...args: unknown[]) => unknown>(name),
				module => {
					if ('default' in module && typeof module.default === 'function')
						cleanup(
							instead(module, 'default', function (args, original) {
								return transform(args[0], Reflect.apply(original, this, args))
							}),
						)
				},
				{ returnNamespace: true, max: Infinity },
			),
		)
	}
}

import type { ReactNode } from 'react'
export function appendToFirstMenuGroup(items: unknown, item: object): unknown {
	if (!Array.isArray(items) || !Array.isArray(items[0])) return items
	return [[...items[0], item], ...items.slice(1)]
}

export function appendToDrawerGroup(result: unknown, row: ReactNode): unknown {
	if (!isValidElement<{ children?: ReactNode }>(result)) return result
	const groups = Children.toArray(result.props.children)
	const index = groups.findIndex(
		group =>
			isValidElement<{ hasIcons?: boolean }>(group) &&
			group.props.hasIcons === true,
	)
	const group = groups[index]
	if (!isValidElement<{ children?: ReactNode }>(group)) return result
	groups[index] = cloneElement(group, {}, group.props.children, row)
	return cloneElement(result, {}, ...groups)
}
