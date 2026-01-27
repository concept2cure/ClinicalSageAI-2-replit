/**
 * Unified Portal Shell - Enterprise Application Frame
 *
 * The central navigation and layout component that brings all modules together.
 * Provides consistent navigation, theming, notifications, and global state.
 *
 * @version 1.0.0
 * @module client/src/components/shell/PortalShell
 */

import React, { useState, useCallback, createContext, useContext, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'wouter';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number | string;
  children?: NavigationItem[];
  permissions?: string[];
  isNew?: boolean;
}

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  organizationId: number;
  organizationName: string;
  permissions: string[];
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: {
    label: string;
    href: string;
  };
}

interface ShellContextValue {
  user: User | null;
  notifications: Notification[];
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

const ShellContext = createContext<ShellContextValue | null>(null);

export const useShell = () => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used within PortalShell');
  }
  return context;
};

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS (Inline SVGs for self-containment)
// ═══════════════════════════════════════════════════════════════════════════════

const Icons = {
  Menu: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  ),
  Close: () => (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Dashboard: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    </svg>
  ),
  Programs: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  ),
  Evidence: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Documents: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
      />
    </svg>
  ),
  CER: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  Submissions: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
      />
    </svg>
  ),
  Analytics: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
      />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  Bell: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Search: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  Help: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const navigationItems: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/',
    icon: <Icons.Dashboard />,
  },
  {
    id: 'programs',
    label: 'Program Workbench',
    href: '/programs',
    icon: <Icons.Programs />,
    badge: 'New',
    isNew: true,
  },
  {
    id: 'evidence',
    label: 'Evidence Library',
    href: '/evidence',
    icon: <Icons.Evidence />,
  },
  {
    id: 'documents',
    label: 'Document Vault',
    href: '/documents',
    icon: <Icons.Documents />,
    children: [
      { id: 'docs-all', label: 'All Documents', href: '/documents', icon: null },
      { id: 'docs-templates', label: 'Templates', href: '/documents/templates', icon: null },
      { id: 'docs-recent', label: 'Recent', href: '/documents/recent', icon: null },
    ],
  },
  {
    id: 'cer',
    label: 'CER Builder',
    href: '/cer',
    icon: <Icons.CER />,
    children: [
      { id: 'cer-projects', label: 'Projects', href: '/cer', icon: null },
      { id: 'cer-generator', label: 'Generator', href: '/cer/generator', icon: null },
      { id: 'cer-review', label: 'Review Queue', href: '/cer/review', icon: null },
    ],
  },
  {
    id: 'submissions',
    label: 'Submissions',
    href: '/submissions',
    icon: <Icons.Submissions />,
    children: [
      { id: 'sub-510k', label: '510(k)', href: '/submissions/510k', icon: null },
      { id: 'sub-ind', label: 'IND', href: '/submissions/ind', icon: null },
      { id: 'sub-ectd', label: 'eCTD', href: '/submissions/ectd', icon: null },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    href: '/analytics',
    icon: <Icons.Analytics />,
  },
];

const bottomNavItems: NavigationItem[] = [
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: <Icons.Settings />,
  },
  {
    id: 'help',
    label: 'Help & Support',
    href: '/help',
    icon: <Icons.Help />,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  user: User | null;
}

const Sidebar: React.FC<SidebarProps> = ({ open, onClose, user }) => {
  const [location] = useLocation();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === '/') return location === '/';
    return location.startsWith(href);
  };

  const renderNavItem = (item: NavigationItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const active = isActive(item.href);

    return (
      <li key={item.id}>
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleExpand(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
              aria-expanded={isExpanded}
              aria-controls={`submenu-${item.id}`}
            >
              <span className="flex items-center gap-3">
                {item.icon && <span aria-hidden="true">{item.icon}</span>}
                <span>{item.label}</span>
                {item.isNew && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                    New
                  </span>
                )}
              </span>
              <span
                className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                <Icons.ChevronDown />
              </span>
            </button>
            {isExpanded && (
              <ul id={`submenu-${item.id}`} className="mt-1 ml-8 space-y-1" role="menu">
                {item.children!.map(child => renderNavItem(child, depth + 1))}
              </ul>
            )}
          </>
        ) : (
          <Link href={item.href}>
            <a
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
              } ${depth > 0 ? 'pl-4' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span>{item.label}</span>
              {item.badge && typeof item.badge === 'number' && (
                <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                  {item.badge}
                </span>
              )}
              {item.isNew && (
                <span className="ml-auto px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                  New
                </span>
              )}
            </a>
          </Link>
        )}
      </li>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <Link href="/">
              <a className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">CS</span>
                </div>
                <span className="font-semibold text-gray-900">ClinicalSage</span>
              </a>
            </Link>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 lg:hidden"
              aria-label="Close navigation"
            >
              <Icons.Close />
            </button>
          </div>

          {/* Organization */}
          {user && (
            <div className="px-4 py-3 border-b border-gray-200">
              <p className="text-xs text-gray-500">Organization</p>
              <p className="text-sm font-medium text-gray-900 truncate">{user.organizationName}</p>
            </div>
          )}

          {/* Main Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1" role="menu">
              {navigationItems.map(item => renderNavItem(item))}
            </ul>
          </nav>

          {/* Bottom Navigation */}
          <div className="border-t border-gray-200 p-4">
            <ul className="space-y-1" role="menu">
              {bottomNavItems.map(item => renderNavItem(item))}
            </ul>
          </div>

          {/* User Profile */}
          {user && (
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-10 h-10 rounded-full" />
                  ) : (
                    <span className="text-sm font-medium text-gray-600">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.role}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface HeaderProps {
  onMenuClick: () => void;
  user: User | null;
  notifications: Notification[];
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, user, notifications }) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-4">
        {/* Left section */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Icons.Menu />
          </button>

          {/* Search */}
          <div className="hidden md:flex items-center">
            <div className="relative">
              <input
                type="search"
                placeholder="Search programs, evidence, documents..."
                className="w-80 pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                aria-label="Global search"
              />
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                aria-hidden="true"
              >
                <Icons.Search />
              </span>
            </div>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2">
          {/* Mobile search */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 md:hidden"
            aria-label="Toggle search"
          >
            <Icons.Search />
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 rounded-lg hover:bg-gray-100"
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              aria-expanded={notificationsOpen}
            >
              <Icons.Bell />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div
                className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                role="dialog"
                aria-label="Notifications"
              >
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Notifications</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-gray-500 text-sm">No notifications</p>
                  ) : (
                    notifications.slice(0, 5).map(notification => (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                          !notification.read ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <Link href="/notifications">
                    <a className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      View all notifications
                    </a>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Help */}
          <button className="p-2 rounded-lg hover:bg-gray-100" aria-label="Help and support">
            <Icons.Help />
          </button>

          {/* User menu */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100"
                aria-expanded={profileOpen}
                aria-label="User menu"
              >
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="text-sm font-medium text-gray-600">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">
                  {user.name}
                </span>
                <Icons.ChevronDown />
              </button>

              {profileOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden"
                  role="menu"
                >
                  <div className="px-4 py-3 border-b border-gray-200">
                    <p className="text-sm font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <Link href="/profile">
                      <a
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        Your Profile
                      </a>
                    </Link>
                    <Link href="/settings">
                      <a
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        Settings
                      </a>
                    </Link>
                    <hr className="my-1" />
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      role="menuitem"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <div className="px-4 py-3 border-t border-gray-200 md:hidden">
          <input
            type="search"
            placeholder="Search..."
            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Search"
            autoFocus
          />
        </div>
      )}
    </header>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PORTAL SHELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface PortalShellProps {
  children: React.ReactNode;
  user?: User | null;
  initialNotifications?: Notification[];
}

/**
 * Unified Portal Shell - The application frame that wraps all pages.
 * Provides navigation, user context, notifications, and consistent layout.
 */
export const PortalShell: React.FC<PortalShellProps> = ({
  children,
  user = null,
  initialNotifications = [],
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // Close sidebar on navigation (mobile)
  const [location] = useLocation();
  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  const contextValue: ShellContextValue = {
    user,
    notifications,
    sidebarOpen,
    setSidebarOpen,
    markNotificationRead,
    clearNotifications,
    theme,
    setTheme,
  };

  return (
    <ShellContext.Provider value={contextValue}>
      <div className="flex h-screen bg-gray-50">
        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} user={user} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <Header
            onMenuClick={() => setSidebarOpen(true)}
            user={user}
            notifications={notifications}
          />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto" role="main">
            <div className="container mx-auto px-4 py-6 max-w-7xl">{children}</div>
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <p>© 2026 ClinicalSage AI. All rights reserved.</p>
              <p>
                <a href="/privacy" className="hover:text-gray-700">
                  Privacy
                </a>
                {' · '}
                <a href="/terms" className="hover:text-gray-700">
                  Terms
                </a>
                {' · '}
                <a href="/help" className="hover:text-gray-700">
                  Support
                </a>
              </p>
            </div>
          </footer>
        </div>
      </div>
    </ShellContext.Provider>
  );
};

export default PortalShell;
