// src/app/providers/ThemeModeProvider.tsx

import { CssBaseline, ThemeProvider } from '@mui/material';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { darkTheme, lightTheme, ThemeModeContext } from '#shared/config/styles';

export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
	const [mode, setMode] = useState<'light' | 'dark'>(() => {
		try {
			const savedMode = localStorage.getItem('themeMode');
			return savedMode === 'light' || savedMode === 'dark' ? savedMode : 'light';
		} catch {
			return 'light';
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem('themeMode', mode);
		} catch {
			// Ignora navegadores con almacenamiento bloqueado.
		}
	}, [mode]);

	const colorMode = useMemo(
		() => ({
			toggleColorMode: () => {
				setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
			},
			mode,
		}),
		[mode],
	);

	const theme = useMemo(() => (mode === 'light' ? lightTheme : darkTheme), [mode]);

	return (
		<ThemeModeContext.Provider value={colorMode}>
			<ThemeProvider theme={theme}>
				<CssBaseline />
				{children}
			</ThemeProvider>
		</ThemeModeContext.Provider>
	);
};
