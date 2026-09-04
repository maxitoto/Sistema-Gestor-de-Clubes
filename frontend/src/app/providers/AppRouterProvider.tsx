// src/app/providers/AppRouterProvider.tsx
import { RouterProvider } from "react-router-dom";
import { routerConfig } from "#app/router/routes";

export const AppRouterProvider = () => {
  return <RouterProvider router={routerConfig} />;
};
