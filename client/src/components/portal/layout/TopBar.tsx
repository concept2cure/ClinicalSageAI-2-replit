/**
 * TopBar - Header component for the Client Portal
 * 
 * Features:
 * - Company branding with customizable theme
 * - Breadcrumb/current page indicator
 * - Global search
 * - Notifications
 * - User menu with profile actions
 * - AI toggle button
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils';
import type { PortalUser, PortalTheme, NavItem } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopBarProps {
  user: PortalUser;
  theme: PortalTheme;
  currentPage?: NavItem;
  onMenuToggle?: () => void;
  onAiToggle?: () => void;
  onLogout?: () => void;
  showAiButton?: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type: 'info' | 'warning' | 'success' | 'error';
}

// =============================================================================
// MOCK DATA
// =============================================================================

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    title: 'Submission Review Complete',
    message: 'FDA 510(k) K241234 review has been completed.',
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    read: false,
    type: 'success',
  },
  {
    id: '2',
    title: 'Document Expiring',
    message: 'CER-2024-001 expires in 30 days.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    read: false,
    type: 'warning',
  },
  {
    id: '3',
    title: 'New Team Member',
    message: 'Sarah Johnson joined the team.',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    read: true,
    type: 'info',
  },
];

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TopBar({
  user,
  theme,
  currentPage,
  onMenuToggle,
  onAiToggle,
  onLogout,
  showAiButton = true,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle search submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Search:', searchQuery);
    // TODO: Implement search functionality
  };
  
  // Count unread notifications
  const unreadCount = MOCK_NOTIFICATIONS.filter(n => !n.read).length;
  
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Left section - Menu toggle and breadcrumb */}
      <div className="flex items-center gap-4">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 hover:bg-muted rounded-md transition-colors"
          aria-label="Toggle menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        
        {/* Breadcrumb */}
        <nav className="hidden sm:flex items-center gap-2 text-sm">
          <Link href="/portal" className="text-muted-foreground hover:text-foreground transition-colors">
            Portal
          </Link>
          {currentPage && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{currentPage.label}</span>
            </>
          )}
        </nav>
      </div>
      
      {/* Right section - Actions */}
      <div className="flex items-center gap-2">
        {/* Global Search */}
        <div ref={searchRef} className="relative">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="absolute right-0 top-1/2 -translate-y-1/2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-64 px-3 py-1.5 text-sm bg-muted rounded-md border-0 focus:ring-2 focus:ring-primary/20 focus:outline-none"
                autoFocus
              />
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 hover:bg-muted rounded-md transition-colors"
              aria-label="Search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
        </div>
        
        {/* AI Assistant Toggle */}
        {showAiButton && onAiToggle && (
          <button
            onClick={onAiToggle}
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
            <span>Ask Lumen</span>
          </button>
        )}
        
        {/* Notifications */}
        <div ref={notificationsRef} className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 hover:bg-muted rounded-md transition-colors"
            aria-label="Notifications"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-destructive text-destructive-foreground text-xs flex items-center justify-center rounded-full">
                {unreadCount}
              </span>
            )}
          </button>
          
          {/* Notifications dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-card rounded-lg border border-border shadow-lg overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-medium">Notifications</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {MOCK_NOTIFICATIONS.map((notification) => (
                  <NotificationRow key={notification.id} notification={notification} />
                ))}
              </div>
              <div className="px-4 py-2 border-t border-border text-center">
                <Link href="/portal/notifications" className="text-sm text-primary hover:underline">
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>
        
        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1 hover:bg-muted rounded-md transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium text-primary">
                  {getInitials(user.displayName)}
                </span>
              )}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden sm:block text-muted-foreground">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          
          {/* User menu dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-card rounded-lg border border-border shadow-lg overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-border">
                <p className="font-medium">{user.displayName}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <div className="py-1">
                <UserMenuItem icon="user" label="Profile" href="/portal/profile" />
                <UserMenuItem icon="settings" label="Settings" href="/portal/settings" />
                <UserMenuItem icon="help-circle" label="Help & Support" href="/portal/help" />
              </div>
              <div className="py-1 border-t border-border">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface NotificationRowProps {
  notification: NotificationItem;
}

function NotificationRow({ notification }: NotificationRowProps) {
  const typeStyles = {
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
  };
  
  return (
    <div className={cn('px-4 py-3 hover:bg-muted transition-colors cursor-pointer', !notification.read && 'bg-primary/5')}>
      <div className="flex items-start gap-3">
        <div className={cn('w-2 h-2 rounded-full mt-2', typeStyles[notification.type])} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{notification.title}</p>
          <p className="text-sm text-muted-foreground truncate">{notification.message}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatTimeAgo(notification.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}

interface UserMenuItemProps {
  icon: string;
  label: string;
  href: string;
}

function UserMenuItem({ icon, label, href }: UserMenuItemProps) {
  const iconPaths: Record<string, React.ReactNode> = {
    user: (
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
    'help-circle': (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  };
  
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {icon === 'user' && (
          <>
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </>
        )}
        {icon === 'settings' && iconPaths.settings}
        {icon === 'help-circle' && iconPaths['help-circle']}
      </svg>
      {label}
    </Link>
  );
}

// =============================================================================
// UTILITIES
// =============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return `${days}d ago`;
  }
}

export default TopBar;
