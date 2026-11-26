import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { IconButton, Tooltip } from '@mui/material';

export function InfoTooltip({
	title,
	label = 'Más información',
}: {
	title: string;
	label?: string;
}) {
	return (
		<Tooltip title={title} arrow enterTouchDelay={0}>
			<IconButton
				size="small"
				aria-label={label}
				sx={{
					p: 0.25,
					ml: 0.25,
					color: 'text.secondary',
					verticalAlign: 'middle',
					'&:hover': { color: 'primary.main' },
				}}
			>
				<InfoOutlinedIcon sx={{ fontSize: 16 }} />
			</IconButton>
		</Tooltip>
	);
}
