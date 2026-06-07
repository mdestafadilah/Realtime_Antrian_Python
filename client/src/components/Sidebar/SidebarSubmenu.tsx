import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import * as Icons from '../../icons';
import { DropdownIcon } from '../../icons';
import type { SidebarRoute, SidebarSubmenuRoute } from '../../routes/sidebar';

const IconRegistry = Icons as unknown as Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
>;

type IconProps = React.SVGProps<SVGSVGElement> & { icon: string };

type SidebarSubmenuProps = {
  route: SidebarRoute;
};

const Icon: React.FC<IconProps> = ({ icon, ...props }) => {
  const IconComponent = IconRegistry[icon];
  if (!IconComponent) return null;
  return <IconComponent {...props} />;
};

const SidebarSubmenu: React.FC<SidebarSubmenuProps> = ({ route }) => {
  const [isDropdownMenuOpen, setIsDropdownMenuOpen] = useState<boolean>(false);

  function handleDropdownMenuClick(): void {
    setIsDropdownMenuOpen(!isDropdownMenuOpen);
  }

  return (
    <li className="relative px-6 py-3" key={route.name}>
      <button
        className="inline-flex items-center justify-between w-full text-sm font-semibold transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200"
        onClick={handleDropdownMenuClick}
        aria-haspopup="true"
      >
        <span className="inline-flex items-center">
          <Icon className="w-5 h-5" aria-hidden="true" icon={route.icon as string} />
          <span className="ml-4">{route.name}</span>
        </span>
        <DropdownIcon className="w-4 h-4" aria-hidden="true" />
      </button>
      <ul
        className={`p-2 mt-2 space-y-2 overflow-hidden text-sm font-medium text-gray-500 rounded-md shadow-inner bg-gray-50 dark:text-gray-400 dark:bg-gray-900 transition-all ease-in-out duration-300 ${
          isDropdownMenuOpen ? 'opacity-100 max-h-screen' : 'opacity-0 max-h-0 hidden'
        }`}
        aria-label="submenu"
      >
        {route.routes?.map((r: SidebarSubmenuRoute) => (
          <li
            className="px-2 py-1 transition-colors duration-150 hover:text-gray-800 dark:hover:text-gray-200"
            key={r.name}
          >
            <Link className="w-full" to={r.path}>
              {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
};

export default SidebarSubmenu;
