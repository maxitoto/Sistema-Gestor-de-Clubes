import { Chip, Stack, Typography } from '@mui/material';
import { DATE_PRESETS, type DateRange, getDatePresetRange } from '#shared/lib/datePresets';

export interface DateRangePresetsProps {
	desde: string;
	hasta: string;
	label?: string;
	disabled?: boolean;
	onSelect: (range: DateRange) => void;
}

export function DateRangePresets({
	desde,
	hasta,
	label,
	disabled = false,
	onSelect,
}: DateRangePresetsProps) {
	return (
		<Stack
			direction="row"
			spacing={0.75}
			useFlexGap
			sx={{ flexWrap: 'wrap', alignItems: 'center' }}
		>
			{label && (
				<Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.5 }}>
					{label}:
				</Typography>
			)}
			{DATE_PRESETS.map((preset) => {
				const range = getDatePresetRange(preset.key);
				const active = desde === range.desde && hasta === range.hasta;
				return (
					<Chip
						key={preset.key}
						size="small"
						label={preset.label}
						clickable={!disabled}
						disabled={disabled}
						color={active ? 'primary' : 'default'}
						variant={active ? 'filled' : 'outlined'}
						onClick={() => onSelect(range)}
					/>
				);
			})}
		</Stack>
	);
}
