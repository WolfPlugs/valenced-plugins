import { Design } from '@valenced/discord/design'
import { formatCount } from './format'

export interface OverviewRowsProps {
	memberCount: number | undefined
	onlineCount: number | undefined
	roleCount: number | undefined
	channelCount: number | undefined
	boostLabel: string | undefined
	premiumTier: number
}

export function OverviewRows({
	memberCount,
	onlineCount,
	roleCount,
	channelCount,
	boostLabel,
	premiumTier,
}: OverviewRowsProps) {
	const { TableRow, TableRowGroup } = Design

	return (
		<TableRowGroup title="Overview">
			<TableRow
				label="Members"
				trailing={<TableRow.TrailingText text={formatCount(memberCount)} />}
			/>
			<TableRow
				label="Online"
				trailing={<TableRow.TrailingText text={formatCount(onlineCount)} />}
			/>
			<TableRow
				label="Roles"
				trailing={<TableRow.TrailingText text={formatCount(roleCount)} />}
			/>
			<TableRow
				label="Channels"
				trailing={<TableRow.TrailingText text={formatCount(channelCount)} />}
			/>
			<TableRow
				label="Boost Level"
				subLabel={boostLabel}
				trailing={<TableRow.TrailingText text={`Level ${premiumTier}`} />}
			/>
		</TableRowGroup>
	)
}
