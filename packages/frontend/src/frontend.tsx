import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '#app/App';
import { ThemeModeProvider } from '#app/providers/ThemeModeProvider';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 1000 * 60 * 5,
			retry: 1,
		},
	},
});

createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ThemeModeProvider>
				<App />
			</ThemeModeProvider>
		</QueryClientProvider>
	</StrictMode>,
);
