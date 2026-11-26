import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
	back?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
	return (
		<Stack spacing={1}>
			{back && <Box sx={{ alignSelf: 'flex-start' }}>{back}</Box>}
			<Stack
				direction={{ xs: 'column', sm: 'row' }}
				spacing={2}
				sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between' }}
			>
				<Box sx={{ minWidth: 0 }}>
					<Typography component="h1" variant="h4">
						{title}
					</Typography>
					{subtitle && (
						<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
							{subtitle}
						</Typography>
					)}
				</Box>
				{actions && (
					<Stack
						direction="row"
						spacing={1}
						useFlexGap
						sx={{ flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}
					>
						{actions}
					</Stack>
				)}
			</Stack>
		</Stack>
	);
}
