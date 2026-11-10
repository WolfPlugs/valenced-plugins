import { beforeEach, expect, mock, test } from 'bun:test'
import type { UserProfileOptions } from '../../plugins/server-info/src/lib/profile'

type Filter = {
	name?: string
	props?: string[]
	dependencies?: unknown[]
	and(other: Filter): Filter
}
function filter(values: Partial<Filter>): Filter {
	return {
		...values,
		and(other) {
			return filter({ ...this, ...other })
		},
	}
}
let exports: object | undefined
let requestedProps: string[]
let requestedDependencies: unknown[] | undefined
let coldOpener: ((options: UserProfileOptions) => unknown) | undefined
let helpersAvailable: boolean
mock.module('@valenced/modules/finders/filters', () => ({
	withProps: (...props: string[]) => {
		requestedProps = props
		return filter({ props })
	},
	withName: (name: string) => filter({ name }),
	withDependencies: Object.assign(
		(dependencies: unknown[]) => filter({ dependencies }),
		{
			relative: (offset: number) => ({ relative: offset }),
		},
	),
}))
mock.module('@valenced/modules/finders', () => ({
	lookupModule: (query: Filter) => {
		if (query.props) return [exports]
		if (query.name === '_asyncToGenerator')
			return helpersAvailable ? [() => {}, 10] : []
		if (query.name === 'asyncRequire')
			return helpersAvailable ? [() => {}, 20] : []
		requestedDependencies = query.dependencies
		return [coldOpener]
	},
}))
const { getUserProfileOpener } = await import(
	'../../plugins/server-info/src/lib/profile'
)

beforeEach(() => {
	exports = undefined
	requestedProps = []
	requestedDependencies = undefined
	coldOpener = undefined
	helpersAvailable = true
})

test('opens the native profile with the selected friend and server', () => {
	const open = mock((_options: UserProfileOptions) => {})
	exports = { default: open }
	const options = {
		userId: 'friend-id',
		guildId: 'server-id',
		ignoreBlockedSpeedBump: false,
	}
	getUserProfileOpener()?.(options)
	expect(requestedProps).toEqual([
		'showUserProfileActionSheetPostConnection',
		'getUserProfileActionSheetKey',
	])
	expect(open).toHaveBeenCalledWith(options)
	expect(requestedDependencies).toBeUndefined()
})
test('supports the post-connection profile opener when the default export is unavailable', () => {
	const open = mock((_options: UserProfileOptions) => {})
	exports = { showUserProfileActionSheetPostConnection: open }
	expect(getUserProfileOpener()).toBe(open)
})
test('loads the native profile opener when no profile module has initialized', () => {
	const open = mock((_options: UserProfileOptions) => {})
	coldOpener = open
	const options = {
		userId: 'friend-id',
		guildId: 'server-id',
		ignoreBlockedSpeedBump: false,
	}
	getUserProfileOpener()?.(options)
	expect(open).toHaveBeenCalledWith(options)
	expect(requestedDependencies).toEqual([
		10,
		null,
		null,
		null,
		null,
		20,
		{ relative: 1 },
		{ relative: 2 },
		null,
		{ relative: 3 },
		null,
		null,
		2,
	])
})
test('does not search uninitialized modules without the fingerprint dependencies', () => {
	helpersAvailable = false
	expect(getUserProfileOpener()).toBeUndefined()
	expect(requestedDependencies).toBeUndefined()
})
test('does not return a non-callable profile export', () => {
	exports = { default: {} }
	expect(getUserProfileOpener()).toBeUndefined()
})
