import { createContext } from 'react';

export interface ThemeModeContextType {
  toggleColorMode: () => void;
  mode: 'light' | 'dark';
}

export const ThemeModeContext = createContext<ThemeModeContextType>({
  toggleColorMode: () => {},
  mode: 'light',
});