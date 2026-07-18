import { RouterProvider } from 'react-router-dom';
import { routerConfig } from '#router/Index';

export const AppRouterProvider = () => {
  return <RouterProvider router={routerConfig} />;
};