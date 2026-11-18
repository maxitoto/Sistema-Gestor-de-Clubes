import { createTheme, type ThemeOptions } from '@mui/material/styles';

const sharedOptions: ThemeOptions = {
	shape: { borderRadius: 8 },
	typography: {
		fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
		fontSize: 14,
		h1: { fontSize: '1.75rem', fontWeight: 700 },
		h4: { fontSize: '1.75rem', fontWeight: 700 },
		h5: { fontSize: '1.375rem', fontWeight: 700 },
		h6: { fontSize: '1.0625rem', fontWeight: 700 },
		button: { textTransform: 'none', fontWeight: 600 },
	},
	components: {
		MuiPaper: {
			defaultProps: { elevation: 0 },
			styleOverrides: { root: { backgroundImage: 'none' } },
		},
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: { root: { borderRadius: 6, minHeight: 38, paddingInline: 16 } },
		},
		MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
		MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 6 } } },
		MuiTableCell: {
			styleOverrides: {
				head: {
					backgroundColor: '#F1F5F9',
					color: '#334155',
					fontWeight: 700,
					fontSize: '0.75rem',
				},
				root: { borderColor: '#E2E8F0', padding: '14px 16px' },
			},
		},
		MuiChip: { styleOverrides: { root: { fontWeight: 600, borderRadius: 6 } } },
		MuiDialog: {
			defaultProps: { fullWidth: true },
			styleOverrides: { paper: { borderRadius: 10 } },
		},
		MuiDialogTitle: {
			styleOverrides: { root: { fontSize: '1.25rem', fontWeight: 700, padding: '24px' } },
		},
		MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px', gap: 8 } } },
		MuiAlert: { styleOverrides: { root: { borderRadius: 6 } } },
	},
};

export const lightTheme = createTheme({
	...sharedOptions,
	palette: {
		mode: 'light',
		primary: { main: '#2563EB', light: '#EFF6FF', dark: '#1D4ED8', contrastText: '#FFFFFF' },
		secondary: { main: '#475569', contrastText: '#FFFFFF' },
		background: { default: '#F8FAFC', paper: '#FFFFFF' },
		text: { primary: '#0F172A', secondary: '#64748B' },
		divider: '#E2E8F0',
		error: { main: '#DC2626' },
		warning: { main: '#B45309' },
		success: { main: '#15803D' },
	},
});

export const darkTheme = createTheme({
	...sharedOptions,
	palette: {
		mode: 'dark',
		primary: { main: '#93B4FF', light: '#172554', dark: '#BFDBFE', contrastText: '#0F172A' },
		secondary: { main: '#CBD5E1', contrastText: '#0F172A' },
		background: { default: '#0F172A', paper: '#182235' },
		text: { primary: '#F1F5F9', secondary: '#CBD5E1' },
		divider: '#334155',
		error: { main: '#FCA5A5' },
		warning: { main: '#FCD34D' },
		success: { main: '#86EFAC' },
	},
	components: {
		...sharedOptions.components,
		MuiTableCell: {
			styleOverrides: {
				head: {
					backgroundColor: '#1E293B',
					color: '#E2E8F0',
					fontWeight: 700,
					fontSize: '0.75rem',
				},
				root: { borderColor: '#334155', padding: '14px 16px' },
			},
		},
	},
});
