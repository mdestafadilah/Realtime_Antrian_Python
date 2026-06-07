import React, { useContext } from 'react';

import SidebarContent from './SidebarContent';
import { SidebarContext } from '../../context/SidebarContext';

type SidebarContextValue = {
  isSidebarOpen: boolean;
  closeSidebar: () => void;
};

const MobileSidebar: React.FC = () => {
  const { isSidebarOpen, closeSidebar } = useContext(SidebarContext) as SidebarContextValue;

  if (!isSidebarOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center transition-opacity duration-150"
        onClick={closeSidebar}
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 z-50 flex-shrink-0 w-64 mt-16 overflow-y-auto bg-white dark:bg-gray-800 lg:hidden transition ease-in-out duration-150">
        <SidebarContent />
      </aside>
    </>
  );
};

export default MobileSidebar;
