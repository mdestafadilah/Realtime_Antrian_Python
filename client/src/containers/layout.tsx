import React, { useContext, useEffect } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';

import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import Main from './Main';
import { SidebarContext } from '../context/SidebarContext';

type SidebarContextValue = {
  isSidebarOpen: boolean;
  closeSidebar: () => void;
};

const Layout: React.FC = () => {
  const { isSidebarOpen, closeSidebar } = useContext(SidebarContext) as SidebarContextValue;
  const location = useLocation();

  useEffect((): void => {
    closeSidebar();
  }, [location, closeSidebar]);

  return (
    <div
      className={`flex h-screen bg-gray-50 dark:bg-gray-900 ${
        isSidebarOpen ? 'overflow-hidden' : ''
      }`}
    >
      <Sidebar />

      <div className="flex flex-col flex-1 w-full">
        <Header />
        <Main>
          <Outlet />
        </Main>
      </div>
    </div>
  );
};

export default Layout;
