/**
 * SidebarNav - Navigation sidebar for the Client Portal
 * 
 * Features:
 * - Company branding with customizable logo
 * - Collapsible sections
 * - Active state highlighting
 * - Badge support for new/beta features
 * - Collapse toggle
 * - Responsive design
 */

import React, { useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import type { NavSection, NavItem, PortalTheme } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface SidebarNavProps {
  navigation: NavSection[];
  collapsed: boolean;
  currentPath: string;
  theme: PortalTheme;
  onToggle: () => void;
}

// =============================================================================
// ICON COMPONENTS
// =============================================================================

// Icon mapping using Lucide-style SVG paths
const ICON_PATHS: Record<string, React.ReactNode> = {
  'layout-dashboard': (
    <>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </>
  ),
  'folder-lock': (
    <>
      <path d="M10 20H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v2.5" />
      <rect width="8" height="5" x="14" y="17" rx="1" />
      <path d="M20 17v-2a2 2 0 1 0-4 0v2" />
    </>
  ),
  'send': (
    <path d="m22 2-7 20-4-9-9-4Z M22 2 11 13" />
  ),
  'wand-2': (
    <>
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </>
  ),
  'file-text': (
    <>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </>
  ),
  'shield-check': (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  'users': (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  'check-circle': (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  'brain': (
    <>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54" />
    </>
  ),
  'settings-2': (
    <>
      <path d="M20 7h-9" />
      <path d="M14 17H5" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </>
  ),
  'bar-chart-3': (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  'message-circle': (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  'users-2': (
    <>
      <path d="M14 19a6 6 0 0 0-12 0" />
      <circle cx="8" cy="9" r="4" />
      <path d="M22 19a6 6 0 0 0-6-6 4 4 0 1 0 0-8" />
    </>
  ),
  'settings': (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'chevron-down': (
    <polyline points="6 9 12 15 18 9" />
  ),
  'chevron-right': (
    <polyline points="9 18 15 12 9 6" />
  ),
  'chevron-left': (
    <polyline points="15 18 9 12 15 6" />
  ),
  'panel-left': (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths = ICON_PATHS[name];
  if (!paths) {
    return <div style={{ width: size, height: size }} />;
  }
  
  return (
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
    >
      {paths}
    </svg>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SidebarNav({
  navigation,
  collapsed,
  currentPath,
  theme,
  onToggle,
}: SidebarNavProps) {
  return (
    <nav className="flex flex-col h-full">
      {/* Brand header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
        {!collapsed ? (
          <Link href="/portal" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {theme.companyName.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-semibold text-lg">{theme.companyName}</span>
          </Link>
        ) : (
          <Link href="/portal" className="mx-auto">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {theme.companyName.slice(0, 2).toUpperCase()}
            </div>
          </Link>
        )}
        
        {/* Collapse toggle - only show when not collapsed */}
        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-muted rounded-md transition-colors"
            aria-label="Collapse sidebar"
          >
            <Icon name="panel-left" size={18} />
          </button>
        )}
      </div>
      
      {/* Expand button when collapsed */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="mx-auto mt-2 p-1.5 hover:bg-muted rounded-md transition-colors"
          aria-label="Expand sidebar"
        >
          <Icon name="chevron-right" size={18} />
        </button>
      )}
      
      {/* Navigation sections */}
      <div className="flex-1 overflow-y-auto py-4">
        {navigation.map((section) => (
          <NavSectionComponent
            key={section.id}
            section={section}
            collapsed={collapsed}
            currentPath={currentPath}
          />
        ))}
      </div>
      
      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-border shrink-0">
          <div className="text-xs text-muted-foreground">
            <p>Concept2Cure Platform</p>
            <p>v2.0.0 • © 2024</p>
          </div>
        </div>
      )}
    </nav>
  );
}

// =============================================================================
// NAV SECTION COMPONENT
// =============================================================================

interface NavSectionComponentProps {
  section: NavSection;
  collapsed: boolean;
  currentPath: string;
}

function NavSectionComponent({ section, collapsed, currentPath }: NavSectionComponentProps) {
  const [isOpen, setIsOpen] = useState(!section.collapsible);
  
  const toggleSection = useCallback(() => {
    if (section.collapsible) {
      setIsOpen(!isOpen);
    }
  }, [section.collapsible, isOpen]);
  
  // Check if section has active item
  const hasActiveItem = section.items.some(item => item.route === currentPath);
  
  // Auto-expand collapsed sections with active items
  React.useEffect(() => {
    if (hasActiveItem && section.collapsible && !isOpen) {
      setIsOpen(true);
    }
  }, [hasActiveItem, section.collapsible]);
  
  return (
    <div className="mb-4">
      {/* Section title */}
      {!collapsed && section.title && (
        <button
          onClick={toggleSection}
          className={cn(
            'w-full flex items-center justify-between px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider',
            section.collapsible && 'hover:text-foreground cursor-pointer',
          )}
          disabled={!section.collapsible}
        >
          <span>{section.title}</span>
          {section.collapsible && (
            <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={14} />
          )}
        </button>
      )}
      
      {/* Section items */}
      {(isOpen || !section.collapsible || collapsed) && (
        <div className="mt-1 space-y-0.5">
          {section.items.map((item) => (
            <NavItemComponent
              key={item.id}
              item={item}
              collapsed={collapsed}
              isActive={item.route === currentPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// NAV ITEM COMPONENT
// =============================================================================

interface NavItemComponentProps {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
}

function NavItemComponent({ item, collapsed, isActive }: NavItemComponentProps) {
  const badgeVariants = {
    default: 'bg-primary/10 text-primary',
    new: 'bg-green-500/10 text-green-600',
    beta: 'bg-yellow-500/10 text-yellow-600',
  };
  
  const getBadgeVariant = (badge?: string) => {
    if (!badge) return null;
    const lowerBadge = badge.toLowerCase();
    if (lowerBadge === 'new') return badgeVariants.new;
    if (lowerBadge === 'beta') return badgeVariants.beta;
    return badgeVariants.default;
  };
  
  return (
    <Link href={item.route}>
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2 mx-2 rounded-md transition-colors cursor-pointer',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          collapsed && 'justify-center px-2',
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon name={item.icon} size={20} />
        
        {!collapsed && (
          <>
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            
            {item.badge && (
              <span className={cn('px-1.5 py-0.5 text-xs rounded-full', getBadgeVariant(item.badge))}>
                {item.badge}
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

export default SidebarNav;
