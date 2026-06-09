import React, { useContext, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SidebarContext } from '../context/SidebarContext';
import { ThemeContext } from '../context/ThemeContext';
import {
  SearchIcon,
  MoonIcon,
  SunIcon,
  BellIcon,
  MenuIcon,
  OutlinePersonIcon,
  OutlineCogIcon,
  OutlineLogoutIcon,
} from '../icons';

type SidebarContextValue = {
  toggleSidebar: () => void;
};

type ThemeContextValue = {
  theme: string;
  toggleTheme: () => void;
};

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useContext(ThemeContext) as ThemeContextValue;
  const { toggleSidebar } = useContext(SidebarContext) as SidebarContextValue;
  const navigate = useNavigate();

  const [isNotificationsMenuOpen, setIsNotificationsMenuOpen] = useState<boolean>(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  function handleNotificationsClick(): void {
    setIsNotificationsMenuOpen(!isNotificationsMenuOpen);
  }

  function handleProfileClick(): void {
    setIsProfileMenuOpen(!isProfileMenuOpen);
  }

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    const token = localStorage.getItem('auth_token');

    // Best-effort: revoke token di server. Kalau gagal/network error,
    // tetap clear state lokal — user tetap dianggap logout.
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // diabaikan
      }
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setIsProfileMenuOpen(false);
    setIsLoggingOut(false);
    navigate({ to: '/login', replace: true });
  }

  return (
    <header className="z-40 py-4 bg-white shadow-bottom dark:bg-gray-800">
      <div className="container flex items-center justify-between h-full px-6 mx-auto text-purple-600 dark:text-purple-300">
        <button
          className="p-1 mr-5 -ml-1 rounded-md lg:hidden focus:outline-none focus:shadow-outline-purple"
          onClick={toggleSidebar}
          aria-label="Menu"
        >
          <MenuIcon className="w-6 h-6" aria-hidden="true" />
        </button>
        <div className="flex justify-center flex-1 lg:mr-32">
          <div className="relative w-full max-w-xl mr-6 focus-within:text-purple-500">
            <div className="absolute inset-y-0 flex items-center pl-2">
              <SearchIcon className="w-4 h-4" aria-hidden="true" />
            </div>
            <input
              className="block w-full pl-8 pr-3 py-2 text-sm text-gray-700 placeholder-gray-600 bg-gray-100 border-0 rounded-md focus:placeholder-gray-500 focus:bg-white focus:border-purple-300 focus:outline-none focus:shadow-outline-purple form-input"
              placeholder="Search for projects"
              aria-label="Search"
            />
          </div>
        </div>
        <ul className="flex items-center flex-shrink-0 space-x-6">
          <li className="flex">
            <button
              className="rounded-md focus:outline-none focus:shadow-outline-purple"
              onClick={toggleTheme}
              aria-label="Toggle color mode"
            >
              {theme === 'dark' ? (
                <SunIcon className="w-5 h-5" aria-hidden="true" />
              ) : (
                <MoonIcon className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </li>
          <li className="relative">
            <button
              className="relative align-middle rounded-md focus:outline-none focus:shadow-outline-purple"
              onClick={handleNotificationsClick}
              aria-label="Notifications"
              aria-haspopup="true"
            >
              <BellIcon className="w-5 h-5" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="absolute top-0 right-0 inline-block w-3 h-3 transform translate-x-1 -translate-y-1 bg-red-600 border-2 border-white rounded-full dark:border-gray-800"
              ></span>
            </button>

            {isNotificationsMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(): void => setIsNotificationsMenuOpen(false)}
                />
                <ul className="absolute right-0 z-20 w-56 p-2 mt-2 space-y-2 text-gray-600 bg-white border border-gray-100 rounded-md shadow-md dark:text-gray-300 dark:border-gray-700 dark:bg-gray-700">
                  <li>
                    <a
                      href="#"
                      className="inline-flex items-center justify-between w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <span>Messages</span>
                      <span className="inline-block px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                        13
                      </span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="inline-flex items-center justify-between w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <span>Sales</span>
                      <span className="inline-block px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full">
                        2
                      </span>
                    </a>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={(): void => alert('Alerts!')}
                      className="inline-flex items-center w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <span>Alerts</span>
                    </button>
                  </li>
                </ul>
              </>
            )}
          </li>
          <li className="relative">
            <button
              className="rounded-full focus:shadow-outline-purple focus:outline-none"
              onClick={handleProfileClick}
              aria-label="Account"
              aria-haspopup="true"
            >
              <img
                className="object-cover w-8 h-8 rounded-full align-middle"
                src="https://images.unsplash.com/photo-1502378735452-bc7d86632805?ixlib=rb-0.3.5&q=80&fm=jpg&crop=entropy&cs=tinysrgb&w=200&fit=max&s=aa3a807e1bbdfd4364d1f449eaa96d82"
                alt=""
                aria-hidden="true"
              />
            </button>
            {isProfileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(): void => setIsProfileMenuOpen(false)}
                />
                <ul className="absolute right-0 z-20 w-56 p-2 mt-2 space-y-2 text-gray-600 bg-white border border-gray-100 rounded-md shadow-md dark:text-gray-300 dark:border-gray-700 dark:bg-gray-700">
                  <li>
                    <a
                      href="#"
                      className="inline-flex items-center w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <OutlinePersonIcon className="w-4 h-4 mr-3" aria-hidden="true" />
                      <span>Profile</span>
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="inline-flex items-center w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <OutlineCogIcon className="w-4 h-4 mr-3" aria-hidden="true" />
                      <span>Settings</span>
                    </a>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="inline-flex items-center w-full px-2 py-1 text-sm font-medium transition-colors duration-150 rounded-md hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <OutlineLogoutIcon className="w-4 h-4 mr-3" aria-hidden="true" />
                      <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
                    </button>
                  </li>
                </ul>
              </>
            )}
          </li>
        </ul>
      </div>
    </header>
  );
};

export default Header;
