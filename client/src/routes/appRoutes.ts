import { lazy } from 'react';
import type { ComponentType } from 'react';

const Page404 = lazy(() => import('../pages/404'));
const Blank = lazy(() => import('../pages/Blank'));

export type AppRoute = {
  path: string;
  component: ComponentType;
};

const routes: AppRoute[] = [
  { path: '/404', component: Page404 },
  { path: '/blank', component: Blank },
];

export default routes;
