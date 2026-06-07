/**
 * ⚠ These are used just to render the Sidebar!
 * You can include any link here, local or external.
 *
 * The leading `-` filename prefix tells TanStack Router to skip this file
 * (per `routeFileIgnorePrefix`), since it's a config module, not a route.
 *
 * For actual Router routes, see TanStack file-based routes
 * (`__root.tsx`, `index.tsx`, etc.).
 *
 * The `icon` value matches a named export from `src/icons/index.ts`.
 */

export type SidebarSubmenuRoute = {
  path: string;
  name: string;
};

export type SidebarRoute = {
  path?: string;
  icon?: string;
  name: string;
  exact?: boolean;
  routes?: SidebarSubmenuRoute[];
};

const routes: SidebarRoute[] = [
  {
    icon: 'PagesIcon',
    name: 'Pages',
    routes: [
      { path: '/login', name: 'Login' },
      { path: '/app/404', name: '404' },
      { path: '/app/blank', name: 'Blank' },
    ],
  },
];

export default routes;
