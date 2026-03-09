/**
 * App Shell V3
 *
 * A polished navigation shell with sidebar, header, and content area.
 * Smooth animations, collapsible sidebar, and user menu.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useCallback, memo, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Home,
  FolderKanban,
  FileText,
  MessageSquare,
  Settings,
  Bell,
  Search,
  Menu,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  HelpCircle,
  Moon,
  Sun,
  Sparkles,
  Target,
  BarChart3,
  Calendar,
  Users,
  Shield,
  Zap,
  Beaker,
  Layers,
  Briefcase,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: number | string;
  children?: NavItem[];
}

interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatar?: string;
  initials: string;
}

interface ShellContextType {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  collapseSidebar: () => void;
}

const ShellContext = createContext<ShellContextType | null>(null);

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/portal/dashboard' },
  { id: 'programs', label: 'Programs', icon: FolderKanban, href: '/portal/programs', badge: 12 },
  { id: 'library', label: 'Evidence Library', icon: FileText, href: '/portal/library' },
  { id: 'assistant', label: 'RI Copilot', icon: Sparkles, href: '/portal/assistant' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/portal/analytics' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, href: '/portal/calendar' },
  { id: 'team', label: 'Team', icon: Users, href: '/portal/team' },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: Settings, href: '/portal/settings' },
  { id: 'help', label: 'Help & Support', icon: HelpCircle, href: '/portal/help' },
];

const MOCK_USER: UserProfile = {
  name: 'Dr. Sarah Chen',
  email: 'sarah.chen@concept2cure.com',
  role: 'Program Lead',
  initials: 'SC',
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOGO
// ═══════════════════════════════════════════════════════════════════════════════

interface LogoProps {
  collapsed?: boolean;
}

// Concept2Cure Logo path
const C2C_LOGO = '/src/assets/concept2cure-logo.jpg';

const Logo: React.FC<LogoProps> = memo(({ collapsed }) => (
  <div className="flex items-center gap-3 px-4 py-5">
    <img src={C2C_LOGO} alt="Concept2Cure" className="w-9 h-9 rounded-xl object-cover shadow-lg" />
    <AnimatePresence>
      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col">
            <span className="text-lg font-bold text-neutral-900 whitespace-nowrap">
              Concept2Cure
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
));

Logo.displayName = 'Logo';

// ═══════════════════════════════════════════════════════════════════════════════
// NAV ITEM
// ═══════════════════════════════════════════════════════════════════════════════

interface NavItemButtonProps {
  item: NavItem;
  active?: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}

const NavItemButton: React.FC<NavItemButtonProps> = memo(({ item, active, collapsed, onClick }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-3 w-full rounded-xl transition-all duration-200',
        collapsed ? 'px-3 py-3 justify-center' : 'px-4 py-2.5',
        active
          ? 'bg-primary-50 text-primary-700'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      )}
      title={collapsed ? item.label : undefined}
    >
      {/* Active indicator */}
      {active && (
        <motion.div
          layoutId="activeNav"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary-600 rounded-r-full"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        />
      )}

      <Icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-primary-600')} />

      <AnimatePresence>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'font-medium text-sm flex-1 text-left whitespace-nowrap overflow-hidden',
              active && 'text-primary-700'
            )}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Badge */}
      {item.badge && !collapsed && (
        <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium">
          {item.badge}
        </span>
      )}

      {item.badge && collapsed && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary-500" />
      )}
    </button>
  );
});

NavItemButton.displayName = 'NavItemButton';

// ═══════════════════════════════════════════════════════════════════════════════
// USER MENU
// ═══════════════════════════════════════════════════════════════════════════════

interface UserMenuProps {
  user: UserProfile;
  collapsed?: boolean;
}

const UserMenu: React.FC<UserMenuProps> = memo(({ user, collapsed }) => {
  const [open, setOpen] = useState(false);

  // Generate consistent color
  const colorIndex = user.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 6;
  const colors = [
    'bg-primary-100 text-primary-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-success-100 text-success-700',
    'bg-info-100 text-info-700',
    'bg-pink-100 text-pink-700',
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-3 w-full rounded-xl transition-colors',
          collapsed ? 'px-3 py-3 justify-center' : 'px-4 py-3',
          'hover:bg-neutral-100'
        )}
      >
        <div
          className={cn(
            'flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm',
            colors[colorIndex]
          )}
        >
          {user.initials}
        </div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-1 text-left overflow-hidden"
            >
              <p className="text-sm font-medium text-neutral-900 truncate">{user.name}</p>
              <p className="text-xs text-neutral-500 truncate">{user.role}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={cn(
                'absolute z-50 bg-white rounded-xl border border-neutral-200 shadow-lg py-2 w-56',
                collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-2 left-0'
              )}
            >
              <div className="px-4 py-2 border-b border-neutral-100">
                <p className="font-medium text-neutral-900">{user.name}</p>
                <p className="text-sm text-neutral-500">{user.email}</p>
              </div>
              <div className="py-1">
                <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                  <User className="w-4 h-4" />
                  Profile
                </button>
                <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </div>
              <div className="border-t border-neutral-100 py-1">
                <button className="flex items-center gap-3 w-full px-4 py-2 text-sm text-error-600 hover:bg-error-50">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

UserMenu.displayName = 'UserMenu';

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
  activeItem?: string;
  onNavigate: (item: NavItem) => void;
}

const Sidebar: React.FC<SidebarProps> = memo(
  ({ collapsed, onCollapse, activeItem, onNavigate }) => (
    <motion.aside
      className={cn(
        'fixed top-0 left-0 h-full bg-white border-r border-neutral-200 flex flex-col z-30',
        'transition-all duration-300 ease-in-out'
      )}
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
    >
      {/* Logo */}
      <Logo collapsed={collapsed} />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden sidebar-scroll">
        {NAV_ITEMS.map(item => (
          <NavItemButton
            key={item.id}
            item={item}
            active={activeItem === item.id}
            collapsed={collapsed}
            onClick={() => onNavigate(item)}
          />
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 py-2 space-y-1 border-t border-neutral-100">
        {BOTTOM_NAV_ITEMS.map(item => (
          <NavItemButton
            key={item.id}
            item={item}
            active={activeItem === item.id}
            collapsed={collapsed}
            onClick={() => onNavigate(item)}
          />
        ))}
      </div>

      {/* User menu */}
      <div className="px-3 py-3 border-t border-neutral-100">
        <UserMenu user={MOCK_USER} collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onCollapse}
        className={cn(
          'absolute top-6 -right-3 z-10',
          'flex items-center justify-center w-6 h-6',
          'bg-white border border-neutral-200 rounded-full shadow-sm',
          'text-neutral-400 hover:text-neutral-600 hover:border-neutral-300',
          'transition-all duration-200'
        )}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </motion.aside>
  )
);

Sidebar.displayName = 'Sidebar';

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════════════════════════

interface HeaderProps {
  title?: string;
  sidebarCollapsed: boolean;
}

const Header: React.FC<HeaderProps> = memo(({ title, sidebarCollapsed }) => {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-16 bg-white/80 backdrop-blur border-b border-neutral-200 z-20',
        'flex items-center justify-between px-6',
        'transition-all duration-300'
      )}
      style={{ left: sidebarCollapsed ? 72 : 256 }}
    >
      {/* Search */}
      <div className={cn('relative transition-all duration-200', searchFocused ? 'w-96' : 'w-72')}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Search anything..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className={cn(
            'w-full pl-10 pr-4 py-2 rounded-lg',
            'bg-neutral-100 border border-transparent',
            'text-neutral-900 placeholder-neutral-400',
            'focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100',
            'transition-all duration-200'
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500 text-xs font-medium">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* RI Quick Action */}
        <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-accent-500 text-white text-sm font-medium hover:from-primary-600 hover:to-accent-600 transition-all shadow-sm">
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">Ask RI</span>
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error-500" />
        </button>

        {/* Theme toggle */}
        <button className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
          <Moon className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE MENU
// ═══════════════════════════════════════════════════════════════════════════════

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  activeItem?: string;
  onNavigate: (item: NavItem) => void;
}

const MobileMenu: React.FC<MobileMenuProps> = memo(({ open, onClose, activeItem, onNavigate }) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: -300 }}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed top-0 left-0 bottom-0 w-72 bg-white z-50 lg:hidden flex flex-col"
        >
          <Logo />
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto sidebar-scroll">
            {NAV_ITEMS.map(item => (
              <NavItemButton
                key={item.id}
                item={item}
                active={activeItem === item.id}
                onClick={() => {
                  onNavigate(item);
                  onClose();
                }}
              />
            ))}
          </nav>
          <div className="px-3 py-3 border-t border-neutral-100">
            <UserMenu user={MOCK_USER} />
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
));

MobileMenu.displayName = 'MobileMenu';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SHELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface AppShellV3Props {
  children: React.ReactNode;
  activeItem?: string;
  onNavigate?: (item: NavItem) => void;
}

export const AppShellV3: React.FC<AppShellV3Props> = ({
  children,
  activeItem = 'dashboard',
  onNavigate,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleCollapse = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const handleNavigate = useCallback(
    (item: NavItem) => {
      onNavigate?.(item);
    },
    [onNavigate]
  );

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapse={handleCollapse}
          activeItem={activeItem}
          onNavigate={handleNavigate}
        />
      </div>

      {/* Mobile Menu */}
      <MobileMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        activeItem={activeItem}
        onNavigate={handleNavigate}
      />

      {/* Header */}
      <Header sidebarCollapsed={sidebarCollapsed} />

      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-neutral-200 z-20 lg:hidden flex items-center justify-between px-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 rounded-lg text-neutral-600 hover:bg-neutral-100"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Logo />
        <button className="p-2 rounded-lg text-neutral-600 hover:bg-neutral-100">
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Main content */}
      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          'lg:pl-64',
          sidebarCollapsed && 'lg:pl-[72px]'
        )}
        style={{ paddingLeft: sidebarCollapsed ? 72 : undefined }}
      >
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
};

export default AppShellV3;
