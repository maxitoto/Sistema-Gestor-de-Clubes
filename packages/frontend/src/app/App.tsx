// src/app/App.tsx

import { AppRouterProvider } from '#app/providers/AppRouterProvider';
import { AuthProvider } from '#app/providers/AuthProvider';

export default function App() {
	return (
		<AuthProvider>
			<AppRouterProvider />
		</AuthProvider>
	);
}
