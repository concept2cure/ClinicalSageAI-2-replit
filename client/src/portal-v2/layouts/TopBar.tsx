/**
 * Concept2Cure Client Portal V2 - Top Bar Navigation
 *
 * Enterprise-grade top navigation with:
 * - Organization/workspace context display
 * - Global search with command palette trigger
 * - Notification center
 * - User menu with role display
 * - Quick action buttons
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  Building,
  User,
  Search,
  Bell,
  Command,
  ChevronDown,
  Settings,
  LogOut,
  HelpCircle,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Plus,
  FileText,
  Upload,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/contexts/TenantContext';
import { usePortal, useNotifications } from '../core/portalContext';
import { ROLE_DISPLAY_MAP } from '../core/portalTypes';
import type { Notification } from '../core/portalTypes';

// Notification icon mapping
const notificationIcons: Record<Notification['type'], React.ReactNode> = {
  info: <Info className="h-4 w-4 text-stone-900" />,
  success: <CheckCircle className="h-4 w-4 text-stone-900" />,
  warning: <AlertTriangle className="h-4 w-4 text-stone-900" />,
  error: <AlertTriangle className="h-4 w-4 text-stone-900" />,
  task: <Clock className="h-4 w-4 text-stone-900" />,
  document: <FileText className="h-4 w-4 text-stone-900" />,
  system: <Zap className="h-4 w-4 text-stone-500" />,
};

interface TopBarProps {
  onMenuToggle?: () => void;
  showMenuButton?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ onMenuToggle, showMenuButton = false }) => {
  const tenant = useTenant();
  const [, setLocation] = useLocation();
  const { user, experience, setCommandPaletteOpen } = usePortal();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const orgName = tenant.currentOrganization?.name || 'Organization';
  const clientName = tenant.currentClientWorkspace?.name || 'Client Workspace';

  // Get role display info
  const roleInfo = user ? ROLE_DISPLAY_MAP[user.role] : null;

  // Keyboard shortcut for command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setCommandPaletteOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to search results
      setLocation(`/client-portal/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Quick actions for the + button
  const quickActions = [
    {
      label: 'New Document',
      icon: FileText,
      action: () => setLocation('/client-portal/vault/new'),
    },
    {
      label: 'Upload Files',
      icon: Upload,
      action: () => setLocation('/client-portal/vault?action=upload'),
    },
    {
      label: 'Create Workflow',
      icon: Zap,
      action: () => setLocation('/client-portal/workflows/new'),
    },
    {
      label: 'Start Submission',
      icon: Command,
      action: () => setLocation('/client-portal/submission-wizard'),
    },
  ];

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm lg:px-6">
      {/* Left section: Menu toggle & Organization info */}
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        {showMenuButton && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle}>
            <Menu className="h-5 w-5" />
          </Button>
        )}

        {/* Organization badge */}
        <div className="flex items-center gap-3">
          <div className="hidden rounded-md bg-gradient-to-br from-stone-900 to-stone-600 p-2 text-white sm:block">
            <Building className="h-5 w-5" />
          </div>
          <div className="hidden md:block">
            <div className="text-xs text-muted-foreground">Current Organization</div>
            <div className="text-sm font-semibold text-stone-900">{orgName}</div>
          </div>
        </div>

        {/* Workspace selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden gap-2 lg:flex">
              <span className="max-w-[150px] truncate">{clientName}</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer">
              <CheckCircle className="mr-2 h-4 w-4 text-stone-900" />
              {clientName}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-muted-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Switch Workspace...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center section: Search */}
      <div className="flex flex-1 justify-center px-4">
        <div className="relative w-full max-w-md">
          {searchOpen ? (
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search documents, modules, actions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-20"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <kbd className="hidden rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500 sm:inline">
                  ESC
                </kbd>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="ml-auto hidden rounded bg-stone-100 px-1.5 py-0.5 text-xs sm:inline">
                ⌘K
              </kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Right section: Actions & User */}
      <div className="flex items-center gap-2">
        {/* Quick actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="hidden sm:flex">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {quickActions.map(action => (
              <DropdownMenuItem
                key={action.label}
                className="cursor-pointer"
                onClick={action.action}
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-xs font-medium text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="font-semibold">Notifications</h4>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-stone-600 hover:text-stone-700"
                  onClick={() => markAllAsRead()}
                >
                  Mark all as read
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-8 w-8 text-stone-300" />
                  <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 10).map(notification => (
                  <button
                    key={notification.id}
                    className={`flex w-full gap-3 border-b p-3 text-left transition-colors hover:bg-stone-50 ${
                      !notification.read ? 'bg-stone-100/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="mt-0.5 shrink-0">{notificationIcons[notification.type]}</div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                        {notification.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {formatTimestamp(notification.timestamp)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-stone-900" />
                    )}
                  </button>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-sm"
                  onClick={() => setLocation('/client-portal/notifications')}
                >
                  View all notifications
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Help */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex"
          onClick={() => setLocation('/client-portal/help')}
        >
          <HelpCircle className="h-5 w-5" />
        </Button>

        {/* AI Assistant */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-stone-600 hover:bg-stone-100 hover:text-stone-700 sm:flex"
          onClick={() => setLocation('/client-portal/ai-assistant')}
        >
          <MessageSquare className="h-5 w-5" />
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-stone-900 to-stone-600 text-sm font-medium text-white">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="hidden text-left md:block">
                <div className="text-sm font-medium">{user?.name || 'User'}</div>
                <div className="text-xs text-muted-foreground">{roleInfo?.label || 'Guest'}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || 'User'}</p>
                <p className="text-xs text-muted-foreground">{user?.email || ''}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation('/client-portal/profile')}
              >
                <User className="mr-2 h-4 w-4" />
                Profile
                <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation('/client-portal/settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setLocation('/client-portal/help')}
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setCommandPaletteOpen(true)}
              >
                <Command className="mr-2 h-4 w-4" />
                Command Palette
                <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {roleInfo && (
              <>
                <div className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: roleInfo.color,
                        color: roleInfo.color,
                      }}
                    >
                      {roleInfo.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{roleInfo.description}</p>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem className="cursor-pointer text-stone-700 focus:bg-stone-100 focus:text-stone-700">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
