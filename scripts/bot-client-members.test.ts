import { expect, it } from 'bun:test'
import {
	canViewChannel,
	memberListPayload,
	parseMembers,
} from '../plugins/bot-client/protocol'

it('validates member API responses', () => {
	expect(() => parseMembers({})).toThrow()
	expect(() => parseMembers([{ user: { id: '1' }, roles: [2] }])).toThrow()
	expect(
		parseMembers([{ user: { id: '1', username: 'Test' }, roles: [] }])[0]?.user
			.id,
	).toBe('1')
})
it('honors role, everyone, user, admin, and owner channel permissions', () => {
	const member = parseMembers([{ user: { id: '1' }, roles: ['3'] }])[0]
	if (!member) throw new Error('Missing test member')
	const guild = {
		id: '2',
		owner_id: '4',
		roles: [
			{ id: '2', permissions: '1024' },
			{ id: '3', permissions: '0' },
		],
	}
	expect(canViewChannel(member, guild, {})).toBe(true)
	const denied = {
		permissionOverwrites: { '2': { id: '2', deny: '1024', allow: '0' } },
	}
	expect(canViewChannel(member, guild, denied)).toBe(false)
	expect(
		canViewChannel(member, guild, {
			permissionOverwrites: {
				...denied.permissionOverwrites,
				'3': { id: '3', allow: 1024n, deny: 0n },
			},
		}),
	).toBe(true)
	expect(
		canViewChannel(member, guild, {
			permissionOverwrites: {
				'1': { id: '1', allow: '0', deny: '1024' },
			},
		}),
	).toBe(false)
	expect(canViewChannel(member, { ...guild, owner_id: '1' }, denied)).toBe(true)
	expect(
		canViewChannel(
			member,
			{ ...guild, roles: [{ id: '2', permissions: '8' }] },
			denied,
		),
	).toBe(true)
})
it('builds native member list SYNC rows without inventing presence status', () => {
	const members = parseMembers([
		{ user: { id: '1', username: 'Test' }, roles: [] },
	])
	const payload = memberListPayload('2', 'everyone', members)
	expect(payload.groups).toEqual([{ id: 'unknown', count: 1 }])
	expect(payload.ops[0]?.range).toEqual([0, 1])
	expect(payload.ops[0]?.items[1]).toEqual({ member: members[0] })
	expect(payload.member_count).toBe(1)
})

it('groups native members by real presence and retains idle and DND states', () => {
	const members = parseMembers([
		{ user: { id: '1' }, roles: [] },
		{ user: { id: '2' }, roles: [] },
		{ user: { id: '3' }, roles: [] },
	])
	const presences = new Map([
		['1', { user: { id: '1' }, status: 'idle', activities: [] }],
		['2', { user: { id: '2' }, status: 'dnd', activities: [] }],
	])
	const payload = memberListPayload('4', 'everyone', members, presences)
	expect(payload.online_count).toBe(2)
	expect(payload.groups).toEqual([
		{ id: 'online', count: 2 },
		{ id: 'offline', count: 1 },
	])
	expect(payload.ops[0]?.range).toEqual([0, 4])
	expect(payload.ops[0]?.items[1]).toMatchObject({
		member: { presence: { status: 'idle' } },
	})
	expect(payload.ops[0]?.items[4]).toMatchObject({
		member: { presence: { status: 'offline' } },
	})
})
