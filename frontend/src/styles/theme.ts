import { createTheme } from '@mui/material/styles';

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#863bff',
      light: '#aa3bff',
      dark: '#5e14ff',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#00c2ff',
      contrastText: '#08060d',
    },
    background: {
      default: '#f4f3ec',
      paper: '#ffffff',
    },
    text: {
      primary: '#08060d',
      secondary: '#6b6375',
    },
    error: { main: '#d32f2f' },
    warning: { main: '#ed6c02' },
    success: { main: '#2e7d32' },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif',
    button: { textTransform: 'none' },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: '8px' },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
  },
});

export const darkTheme = createTheme({
  ...lightTheme,
  palette: {
    mode: 'dark',
    primary: lightTheme.palette.primary,
    secondary: lightTheme.palette.secondary,
    background: {
      default: '#16171d',
      paper: '#1f2028',
    },
    text: {
      primary: '#f3f4f6',
      secondary: '#9ca3af',
    },
  },
});