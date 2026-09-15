// src/app/App.tsx
import { AuthProvider } from "#app/providers/AuthProvider";
import { AppRouterProvider } from "#app/providers/AppRouterProvider";

export default function App() {
  return (
    <AuthProvider>
      <AppRouterProvider />
    </AuthProvider>
  );
}
