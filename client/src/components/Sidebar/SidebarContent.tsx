import React from 'react';
import { Link } from '@tanstack/react-router';
import * as Icons from '../../icons';
import routes from '../../routes/sidebar';
import type { SidebarRoute } from '../../routes/sidebar';
import SidebarSubmenu from './SidebarSubmenu';

const IconRegistry = Icons as unknown as Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
>;

type IconProps = React.SVGProps<SVGSVGElement> & { icon: string };

const Icon: React.FC<IconProps> = ({ icon, ...props }) => {
  const IconComponent = IconRegistry[icon];
  if (!IconComponent) return null;
  return <IconComponent {...props} />;
};

const SidebarContent: React.FC = () => {
  return (
    <div className="py-4 text-gray-500 dark:text-gray-400">
      <a className="ml-6 text-lg font-bold text-gray-800 dark:text-gray-200" href="#">
        Realtime Antrian
      </a>
      <ul className="mt-6">
        {routes.map((route: SidebarRoute) =>
          route.routes ? (
            <SidebarSubmenu route={route} key={route.name} />
          ) : (
            <li className="relative px-6 py-3" key={route.name}>
              <Link
                to={route.path as string}
                className="inline-flex items-center w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200"
                activeProps={{ className: 'text-gray-800 dark:text-gray-100' }}
              >
                <Icon className="w-5 h-5" aria-hidden="true" icon={route.icon as string} />
                <span className="ml-4">{route.name}</span>
              </Link>
            </li>
          )
        )}
      </ul>
      <div className="px-6 my-6">
        <button
          type="button"
          className="inline-flex items-center justify-center w-full px-5 py-2 text-sm font-medium leading-5 text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
        >
          Create account
          <span className="ml-2" aria-hidden="true">
            +
          </span>
        </button>
      </div>
    </div>
  );
};

export default SidebarContent;
