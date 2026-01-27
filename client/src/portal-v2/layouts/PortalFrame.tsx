/**
 * TrialSage Client Portal V2 - Portal Frame Layout
 *
 * Main layout wrapper providing:
 * - Responsive navigation (sidebar + topbar)
 * - Command palette integration
 * - Mobile navigation drawer
 * - Breadcrumb support
 * - Loading states
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Command,
  Search,
  FileText,
  FolderOpen,
  Settings,
  LayoutGrid,
  ShieldCheck,
  FlaskConical,
  LineChart,
  Activity,
  HelpCircle,
  LogOut,
  User,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';
import { TopBar } from './TopBar';
import { SidebarNav } from './SidebarNav';
import { usePortal, useModuleAccess } from '../core/portalContext';
import { MODULE_REGISTRY } from '../core/moduleRegistry';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import type { ModuleId } from '../core/portalTypes';

// Module route mapping
const moduleRouteMap: Record<string, string> = {
  dashboard: '/client-portal',
  vault: '/client-portal/vault',
  regulatory_intel: '/client-portal/regulatory-intel',
  cmc_platform: '/client-portal/cmc-wizard',
  clinical_trial: '/client-portal/study-architect',
  quality_management: '/client-portal/quality',
  document_control: '/client-portal/documents',
  analytics: '/client-portal/analytics',
  ind_automation: '/client-portal/ind-wizard',
  cer_generator: '/client-portal/cer-generator',
  protocol_designer: '/client-portal/protocol-designer',
  safety_database: '/client-portal/safety',
  biostatistics: '/client-portal/biostatistics',
  medical_writing: '/client-portal/medical-writing',
  dossier_builder: '/client-portal/dossier',
  submission_tracker: '/client-portal/submissions',
  audit_trail: '/client-portal/audit',
  settings: '/client-portal/settings',
};

// Icon mapping
const moduleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutGrid,
  vault: FolderOpen,
  regulatory_intel: ShieldCheck,
  clinical_trial: FlaskConical,
  analytics: LineChart,
  settings: Settings,
};

interface PortalFrameProps {
  children: React.ReactNode;
  loading?: boolean;
  title?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export const PortalFrame: React.FC<PortalFrameProps> = ({
  children,
  loading = false,
  title,
  breadcrumbs,
}) => {
  const [location, setLocation] = useLocation();
  const { experience, commandPaletteOpen, setCommandPaletteOpen, sidebarCollapsed } = usePortal();
  const { hasAccess } = useModuleAccess();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get accessible modules for command palette
  const accessibleModules = useMemo(() => {
    return experience.modules.filter(moduleId => hasAccess(moduleId));
  }, [experience.modules, hasAccess]);

  // Define command item type
  interface CommandItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    action: () => void;
    keywords?: string;
    shortcut?: string;
  }

  interface CommandGroup {
    group: string;
    items: CommandItem[];
  }

  // Command palette actions
  const commandActions = useMemo((): CommandGroup[] => {
    return [
      {
        group: 'Navigation',
        items: accessibleModules.map(moduleId => {
          const module = MODULE_REGISTRY[moduleId];
          const Icon = moduleIcons[moduleId] || LayoutGrid;
          return {
            id: moduleId,
            label: module?.label || moduleId,
            icon: Icon,
            action: () => setLocation(moduleRouteMap[moduleId] || '/client-portal'),
            keywords: [module?.label, module?.description, moduleId].filter(Boolean).join(' '),
          };
        }),
      },
      {
        group: 'Quick Actions',
        items: [
          {
            id: 'new-document',
            label: 'Create New Document',
            icon: FileText,
            action: () => setLocation('/client-portal/vault/new'),
            shortcut: '⌘N',
          },
          {
            id: 'search',
            label: 'Search Documents',
            icon: Search,
            action: () => setLocation('/client-portal/search'),
            shortcut: '⌘F',
          },
          {
            id: 'help',
            label: 'Help & Documentation',
            icon: HelpCircle,
            action: () => setLocation('/client-portal/help'),
            shortcut: '⌘H',
          },
        ],
      },
      {
        group: 'Account',
        items: [
          {
            id: 'profile',
            label: 'View Profile',
            icon: User,
            action: () => setLocation('/client-portal/profile'),
          },
          {
            id: 'settings',
            label: 'Settings',
            icon: Settings,
            action: () => setLocation('/client-portal/settings'),
            shortcut: '⌘,',
          },
          {
            id: 'logout',
            label: 'Log Out',
            icon: LogOut,
            action: () => {
              // Redirect to logout endpoint
              window.location.href = '/api/auth/logout';
            },
          },
        ],
      },
    ];
  }, [accessibleModules, setLocation]);

  // Handle command palette keyboard shortcut
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

  // Handle command selection
  const handleCommandSelect = useCallback(
    (action: () => void) => {
      setCommandPaletteOpen(false);
      action();
    },
    [setCommandPaletteOpen]
  );

  // Generate breadcrumbs from current location if not provided
  const currentBreadcrumbs = useMemo(() => {
    if (breadcrumbs) return breadcrumbs;

    const pathParts = location.split('/').filter(Boolean);
    const crumbs: Array<{ label: string; href?: string }> = [
      { label: 'Portal', href: '/client-portal' },
    ];

    let currentPath = '';
    pathParts.forEach((part, index) => {
      currentPath += `/${part}`;
      if (part === 'client-portal') return;

      // Convert path part to readable label
      const label = part
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      crumbs.push({
        label,
        href: index < pathParts.length - 1 ? currentPath : undefined,
      });
    });

    return crumbs;
  }, [location, breadcrumbs]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top Navigation Bar */}
      <TopBar onMenuToggle={() => setMobileMenuOpen(true)} showMenuButton={true} />

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <SidebarNav />

        {/* Mobile Sidebar Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SidebarNav collapsed={false} onCollapseChange={() => {}} />
          </SheetContent>
        </Sheet>

        {/* Main Content Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumbs */}
          {currentBreadcrumbs.length > 1 && (
            <div className="border-b bg-white px-4 py-2 lg:px-6">
              <nav className="flex items-center space-x-1 text-sm">
                {currentBreadcrumbs.map((crumb, index) => (
                  <React.Fragment key={index}>
                    {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
                    {crumb.href ? (
                      <button
                        onClick={() => setLocation(crumb.href!)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-900">{crumb.label}</span>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            </div>
          )}

          {/* Page Title */}
          {title && (
            <div className="border-b bg-white px-4 py-4 lg:px-6">
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {commandActions.map((group, groupIndex) => (
            <React.Fragment key={group.group}>
              {groupIndex > 0 && <CommandSeparator />}
              <CommandGroup heading={group.group}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      onSelect={() => handleCommandSelect(item.action)}
                      keywords={[item.keywords || item.label]}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      <span>{item.label}</span>
                      {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  );
};
