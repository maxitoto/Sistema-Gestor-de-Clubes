import { createTheme, type ThemeOptions } from '@mui/material/styles';

const sharedOptions: ThemeOptions = {
	shape: { borderRadius: 8 },
	typography: {
		fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
		fontSize: 14,
		h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em' },
		h4: { fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25 },
		h5: { fontSize: '1.3125rem', fontWeight: 700, letterSpacing: '-0.015em' },
		h6: { fontSize: '1.0625rem', fontWeight: 700 },
		subtitle1: { fontWeight: 600 },
		button: { textTransform: 'none', fontWeight: 600 },
	},
	components: {
		MuiPaper: {
			defaultProps: { elevation: 0 },
			styleOverrides: {
				root: { backgroundImage: 'none' },
				outlined: { borderRadius: 10 },
			},
		},
		MuiButton: {
			defaultProps: { disableElevation: true },
			styleOverrides: {
				root: { borderRadius: 7, minHeight: 36, paddingInline: 14 },
				sizeSmall: { minHeight: 30, paddingInline: 10, fontSize: '0.8125rem' },
			},
		},
		MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
		MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 7 } } },
		MuiTab: {
			styleOverrides: {
				root: { textTransform: 'none', fontWeight: 600, minHeight: 44 },
			},
		},
		MuiDialog: {
			defaultProps: { fullWidth: true },
			styleOverrides: { paper: { borderRadius: 12 } },
		},
		MuiDialogTitle: {
			styleOverrides: { root: { fontSize: '1.2rem', fontWeight: 700, padding: '20px 24px' } },
		},
		MuiDialogActions: {
			styleOverrides: { root: { padding: '14px 24px', gap: 8 } },
		},
		MuiAlert: {
			styleOverrides: { root: { borderRadius: 8, alignItems: 'center' } },
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 600, borderRadius: 6, whiteSpace: 'nowrap' },
			},
		},
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
		error: { main: '#DC2626', light: '#FEF2F2', dark: '#991B1B' },
		warning: { main: '#B45309', light: '#FFFBEB', dark: '#92400E' },
		success: { main: '#15803D', light: '#ECFDF5', dark: '#065F46' },
		info: { main: '#0284C7', light: '#F0F9FF', dark: '#075985' },
	},
	components: {
		...sharedOptions.components,
		MuiTableCell: {
			styleOverrides: {
				head: {
					backgroundColor: '#F8FAFC',
					color: '#475569',
					fontWeight: 700,
					fontSize: '0.75rem',
					letterSpacing: '0.02em',
					whiteSpace: 'nowrap',
				},
				root: { borderColor: '#E2E8F0' },
				sizeSmall: { padding: '10px 14px' },
				sizeMedium: { padding: '14px 16px' },
				alignRight: { fontVariantNumeric: 'tabular-nums' },
			},
		},
		MuiTableRow: {
			styleOverrides: {
				root: {
					'tbody &:hover': { backgroundColor: '#F8FAFC' },
				},
			},
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 600, borderRadius: 6, whiteSpace: 'nowrap' },
				filled: ({ ownerState }) => {
					if (ownerState.color === 'success') {
						return {
							backgroundColor: '#ECFDF5',
							color: '#065F46',
							border: '1px solid #A7F3D0',
						};
					}
					if (ownerState.color === 'warning') {
						return {
							backgroundColor: '#FFFBEB',
							color: '#92400E',
							border: '1px solid #FDE68A',
						};
					}
					if (ownerState.color === 'error') {
						return {
							backgroundColor: '#FEF2F2',
							color: '#991B1B',
							border: '1px solid #FECACA',
						};
					}
					if (ownerState.color === 'info') {
						return {
							backgroundColor: '#EFF6FF',
							color: '#1E40AF',
							border: '1px solid #BFDBFE',
						};
					}
					if (ownerState.color === 'default') {
						return {
							backgroundColor: '#F1F5F9',
							color: '#334155',
							border: '1px solid #E2E8F0',
						};
					}
					return {};
				},
			},
		},
		MuiTooltip: {
			styleOverrides: {
				tooltip: {
					backgroundColor: '#0F172A',
					color: '#F8FAFC',
					fontSize: '0.78rem',
					lineHeight: 1.45,
					padding: '8px 12px',
					borderRadius: 6,
				},
				arrow: { color: '#0F172A' },
			},
		},
	},
});

export const darkTheme = createTheme({
	...sharedOptions,
	palette: {
		mode: 'dark',
		primary: { main: '#93B4FF', light: '#1E293B', dark: '#BFDBFE', contrastText: '#0F172A' },
		secondary: { main: '#CBD5E1', contrastText: '#0F172A' },
		background: { default: '#0F172A', paper: '#182235' },
		text: { primary: '#F1F5F9', secondary: '#CBD5E1' },
		divider: '#334155',
		error: { main: '#FCA5A5', light: '#450A0A', dark: '#FEE2E2' },
		warning: { main: '#FCD34D', light: '#451A03', dark: '#FEF3C7' },
		success: { main: '#86EFAC', light: '#052E16', dark: '#DCFCE7' },
		info: { main: '#7DD3FC', light: '#082F49', dark: '#E0F2FE' },
	},
	components: {
		...sharedOptions.components,
		MuiTableCell: {
			styleOverrides: {
				head: {
					backgroundColor: '#1E293B',
					color: '#CBD5E1',
					fontWeight: 700,
					fontSize: '0.75rem',
					letterSpacing: '0.02em',
					whiteSpace: 'nowrap',
				},
				root: { borderColor: '#334155' },
				sizeSmall: { padding: '10px 14px' },
				sizeMedium: { padding: '14px 16px' },
				alignRight: { fontVariantNumeric: 'tabular-nums' },
			},
		},
		MuiTableRow: {
			styleOverrides: {
				root: {
					'tbody &:hover': { backgroundColor: 'rgba(148, 163, 184, 0.08)' },
				},
			},
		},
		MuiChip: {
			styleOverrides: {
				root: { fontWeight: 600, borderRadius: 6, whiteSpace: 'nowrap' },
				filled: ({ ownerState }) => {
					if (ownerState.color === 'success') {
						return {
							backgroundColor: 'rgba(22, 163, 74, 0.2)',
							color: '#86EFAC',
							border: '1px solid rgba(134, 239, 172, 0.35)',
						};
					}
					if (ownerState.color === 'warning') {
						return {
							backgroundColor: 'rgba(217, 119, 6, 0.22)',
							color: '#FCD34D',
							border: '1px solid rgba(252, 211, 77, 0.35)',
						};
					}
					if (ownerState.color === 'error') {
						return {
							backgroundColor: 'rgba(220, 38, 38, 0.22)',
							color: '#FCA5A5',
							border: '1px solid rgba(252, 165, 165, 0.35)',
						};
					}
					if (ownerState.color === 'info') {
						return {
							backgroundColor: 'rgba(37, 99, 235, 0.22)',
							color: '#93C5FD',
							border: '1px solid rgba(147, 197, 253, 0.35)',
						};
					}
					if (ownerState.color === 'default') {
						return {
							backgroundColor: 'rgba(148, 163, 184, 0.16)',
							color: '#E2E8F0',
							border: '1px solid rgba(148, 163, 184, 0.3)',
						};
					}
					return {};
				},
			},
		},
		MuiTooltip: {
			styleOverrides: {
				tooltip: {
					backgroundColor: '#E2E8F0',
					color: '#0F172A',
					fontSize: '0.78rem',
					lineHeight: 1.45,
					padding: '8px 12px',
					borderRadius: 6,
				},
				arrow: { color: '#E2E8F0' },
			},
		},
	},
});
