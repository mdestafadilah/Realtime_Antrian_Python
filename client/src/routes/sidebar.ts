/**
 * ⚠ These are used just to render the Sidebar!
 * You can include any link here, local or external.
 *
 * If you're looking to actual Router routes, go to
 * `routes/appRoutes.ts`
 *
 * The `icon` value matches a key in the lucide-react icon map used by
 * SidebarContent / SidebarSubmenu.
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
