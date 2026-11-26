import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
	title: string;
	description?: string;
	icon?: ReactNode;
	action?: ReactNode;
	tone?: 'default' | 'success';
}

export function EmptyState({
	title,
	description,
	icon,
	action,
	tone = 'default',
}: EmptyStateProps) {
	return (
		<Stack
			spacing={1.25}
			sx={{
				py: 4.5,
				px: 2,
				alignItems: 'center',
				textAlign: 'center',
			}}
		>
			<Box
				sx={{
					width: 44,
					height: 44,
					borderRadius: 2,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					bgcolor: tone === 'success' ? 'success.main' : 'action.hover',
					color: tone === 'success' ? 'common.white' : 'text.secondary',
					opacity: tone === 'success' ? 0.9 : 1,
				}}
			>
				{icon ?? <InboxOutlinedIcon />}
			</Box>
			<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
				{title}
			</Typography>
			{description && (
				<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
					{description}
				</Typography>
			)}
			{action && <Box sx={{ pt: 0.5 }}>{action}</Box>}
		</Stack>
	);
}
