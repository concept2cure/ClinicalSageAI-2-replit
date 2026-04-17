import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Bell, ChevronDown, Menu, Search, User, X } from 'lucide-react';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';

const AppHeader = () => {
  const [location] = useLocation();
  const { data } = useModuleIntegration();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Hide mobile menu if we navigate to a new page
  const handleNavigation = () => {
    setShowMobileMenu(false);
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  // Toggle user menu
  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
    if (showNotifications) setShowNotifications(false);
  };

  // Toggle notifications panel
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    if (showUserMenu) setShowUserMenu(false);
  };

  // Determine if current page is landing page
  const isLandingPage = location === '/';

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-full mx-auto px-4 lg:px-6">
        <div className="flex justify-between h-16">
          <div className="flex">
            {/* Logo/Brand */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/">
                <a className="flex items-center">
                  <span className="text-2xl font-bold text-pink-600">Concept2Cure</span>
                  <span className="text-xs bg-gray-800 text-white px-1.5 py-0.5 rounded ml-1 font-medium">
                    v1.0
                  </span>
                </a>
              </Link>
            </div>

            {/* Main navigation - desktop only */}
            <nav className="hidden lg:ml-6 lg:flex lg:space-x-4 items-center">
              {!isLandingPage && (
                <>
                  <Link href="/dashboard">
                    <a
                      onClick={handleNavigation}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${location === '/dashboard' ? 'text-pink-600' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                      Dashboard
                    </a>
                  </Link>
                  <Link href="/vault">
                    <a
                      onClick={handleNavigation}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${location === '/vault' ? 'text-pink-600' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                      Vault
                    </a>
                  </Link>
                  <Link href="/csr-intelligence">
                    <a
                      onClick={handleNavigation}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${location === '/csr-intelligence' ? 'text-pink-600' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                      CSR Intelligence
                    </a>
                  </Link>
                  <Link href="/study-architect">
                    <a
                      onClick={handleNavigation}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${location === '/study-architect' ? 'text-pink-600' : 'text-gray-700 hover:text-gray-900'}`}
                    >
                      Study Architect
                    </a>
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Right side - search, notifications, profile */}
          <div className="flex items-center">
            {/* Search */}
            <div className="hidden md:block relative mr-4">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search..."
                className="w-56 pl-10 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>

            {/* Notifications */}
            <div className="relative ml-3">
              <button
                onClick={toggleNotifications}
                className="p-1 rounded-full text-gray-600 hover:text-gray-900 focus:outline-none"
              >
                <span className="sr-only">View notifications</span>
                <div className="relative">
                  <Bell size={22} />
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-pink-600 text-white text-xs flex items-center justify-center">
                    3
                  </span>
                </div>
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium">Notifications</h3>
                        <button className="text-xs text-pink-600 hover:text-pink-800">
                          Mark all as read
                        </button>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        className="block w-full text-left px-4 py-3 hover:bg-gray-50 border-l-2 border-pink-500"
                        onClick={() => window.location.href = '/csr-intelligence'}
                      >
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-500">
                              <FileText size={16} />
                            </div>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              New CSR draft ready for review
                            </p>
                            <p className="text-xs text-gray-500 mt-1">5 minutes ago</p>
                          </div>
                        </div>
                      </button>

                      <button type="button" className="block w-full text-left px-4 py-3 hover:bg-gray-50" onClick={() => window.location.href = '/vault'}>
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                              <User size={16} />
                            </div>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm text-gray-900">
                              Sarah Johnson shared a document with you
                            </p>
                            <p className="text-xs text-gray-500 mt-1">2 hours ago</p>
                          </div>
                        </div>
                      </button>

                      <button type="button" className="block w-full text-left px-4 py-3 hover:bg-gray-50" onClick={() => window.location.href = '/study-architect'}>
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-500">
                              <CheckCircle size={16} />
                            </div>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm text-gray-900">
                              Protocol XYZ-123 has been approved
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Yesterday</p>
                          </div>
                        </div>
                      </button>
                    </div>

                    <div className="px-4 py-2 border-t border-gray-100">
                      <button
                        type="button"
                        className="text-xs text-center text-pink-600 hover:text-pink-800 block w-full"
                        onClick={() => window.location.href = '/notifications'}
                      >
                        View all notifications
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile dropdown */}
            <div className="relative ml-3">
              <button
                onClick={toggleUserMenu}
                className="flex text-sm rounded-full focus:outline-none items-center"
              >
                <span className="sr-only">Open user menu</span>
                <div className="h-8 w-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
                  <User size={16} />
                </div>
                <span className="hidden md:block ml-2 text-sm font-medium text-gray-700">
                  Admin User
                </span>
                <ChevronDown size={16} className="hidden md:block ml-1 text-gray-400" />
              </button>

              {/* Profile Dropdown Menu */}
              {showUserMenu && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <button type="button" className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => window.location.href = '/profile'}>
                      Your Profile
                    </button>
                    <button type="button" className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => window.location.href = '/settings'}>
                      Settings
                    </button>
                    <button type="button" className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={() => window.location.href = '/client-settings'}>
                      Client Settings
                    </button>
                    <div className="border-t border-gray-100"></div>
                    <button type="button" className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100" onClick={() => window.location.href = '/logout'}>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center lg:hidden ml-2">
              <button
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pink-500"
              >
                <span className="sr-only">Open main menu</span>
                {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {showMobileMenu && (
        <div className="lg:hidden border-t border-gray-200">
          <div className="pt-2 pb-3 space-y-1 px-4">
            <div className="block w-full py-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={16} className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <Link href="/dashboard">
              <a
                onClick={handleNavigation}
                className={`block px-3 py-2 rounded-md text-base font-medium ${location === '/dashboard' ? 'text-pink-600 bg-pink-50' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Dashboard
              </a>
            </Link>
            <Link href="/vault">
              <a
                onClick={handleNavigation}
                className={`block px-3 py-2 rounded-md text-base font-medium ${location === '/vault' ? 'text-pink-600 bg-pink-50' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Vault
              </a>
            </Link>
            <Link href="/csr-intelligence">
              <a
                onClick={handleNavigation}
                className={`block px-3 py-2 rounded-md text-base font-medium ${location === '/csr-intelligence' ? 'text-pink-600 bg-pink-50' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                CSR Intelligence
              </a>
            </Link>
            <Link href="/study-architect">
              <a
                onClick={handleNavigation}
                className={`block px-3 py-2 rounded-md text-base font-medium ${location === '/study-architect' ? 'text-pink-600 bg-pink-50' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Study Architect
              </a>
            </Link>
          </div>
          <div className="pt-4 pb-3 border-t border-gray-200">
            <div className="flex items-center px-4">
              <div className="flex-shrink-0">
                <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center">
                  <User size={18} />
                </div>
              </div>
              <div className="ml-3">
                <div className="text-base font-medium text-gray-800">Admin User</div>
                <div className="text-sm font-medium text-gray-500">admin@example.com</div>
              </div>
              <button
                onClick={toggleNotifications}
                className="ml-auto p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500"
              >
                <span className="sr-only">View notifications</span>
                <div className="relative">
                  <Bell size={20} />
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-pink-600 text-white text-xs flex items-center justify-center">
                    3
                  </span>
                </div>
              </button>
            </div>
            <div className="mt-3 space-y-1 px-4">
              <button
                type="button"
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => window.location.href = '/profile'}
              >
                Your Profile
              </button>
              <button
                type="button"
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => window.location.href = '/settings'}
              >
                Settings
              </button>
              <button
                type="button"
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-gray-50"
                onClick={() => window.location.href = '/client-settings'}
              >
                Client Settings
              </button>
              <button
                type="button"
                className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:bg-gray-50"
                onClick={() => window.location.href = '/logout'}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

// For notifications
const FileText = ({ size, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const CheckCircle = ({ size, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default AppHeader;
