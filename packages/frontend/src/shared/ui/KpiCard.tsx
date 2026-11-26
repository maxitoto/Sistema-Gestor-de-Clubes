import { Box, ButtonBase, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export type KpiTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface KpiCardProps {
	label: string;
	value: ReactNode;
	caption?: ReactNode;
	tone?: KpiTone;
	active?: boolean;
	onClick?: () => void;
	trailing?: ReactNode;
}

const borderColorByTone: Record<KpiTone, string> = {
	primary: 'primary.main',
	success: 'success.main',
	warning: 'warning.main',
	error: 'error.main',
	info: 'info.main',
	neutral: 'divider',
};

const valueColorByTone: Record<KpiTone, string> = {
	primary: 'text.primary',
	success: 'success.main',
	warning: 'warning.main',
	error: 'error.main',
	info: 'info.main',
	neutral: 'text.primary',
};

export function KpiCard({
	label,
	value,
	caption,
	tone = 'primary',
	active = false,
	onClick,
	trailing,
}: KpiCardProps) {
	const content = (
		<Paper
			variant="outlined"
			sx={{
				p: 2,
				width: '100%',
				height: '100%',
				textAlign: 'left',
				borderLeftWidth: 4,
				borderLeftColor: borderColorByTone[tone],
				...(active
					? {
							borderColor: borderColorByTone[tone],
							bgcolor: 'action.selected',
						}
					: {}),
				...(onClick
					? {
							transition: 'border-color 140ms ease, background-color 140ms ease',
							'&:hover': { bgcolor: 'action.hover', borderColor: borderColorByTone[tone] },
						}
					: {}),
			}}
		>
			<Stack
				direction="row"
				spacing={1}
				sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
			>
				<Box sx={{ minWidth: 0 }}>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ fontWeight: 600, display: 'block' }}
					>
						{label}
					</Typography>
					<Typography
						variant="h5"
						sx={{
							mt: 0.5,
							fontWeight: 700,
							fontVariantNumeric: 'tabular-nums',
							color: valueColorByTone[tone],
						}}
					>
						{value}
					</Typography>
				</Box>
				{trailing}
			</Stack>
			{caption && (
				<Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
					{caption}
				</Typography>
			)}
		</Paper>
	);

	if (!onClick) {
		return content;
	}

	return (
		<ButtonBase
			onClick={onClick}
			aria-pressed={active}
			sx={{
				display: 'block',
				width: '100%',
				height: '100%',
				borderRadius: 1.25,
				textAlign: 'left',
				'&.Mui-focusVisible': {
					outline: '2px solid',
					outlineColor: 'primary.main',
					outlineOffset: 2,
				},
			}}
		>
			{content}
		</ButtonBase>
	);
}
