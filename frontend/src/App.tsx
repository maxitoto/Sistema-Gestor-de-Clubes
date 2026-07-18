import { AuthProvider } from '#providers/AuthProvider';
import { AppRouterProvider } from '#providers/AppRouterProvider';

export default function App() {
  return (
    <AuthProvider>
      <AppRouterProvider />
    </AuthProvider>
  );
}