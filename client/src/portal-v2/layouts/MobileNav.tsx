/**
 * Concept2Cure Client Portal V2 - Mobile Navigation
 *
 * Bottom navigation bar for mobile devices with:
 * - Quick access to primary modules
 * - Active state indicators
 * - Smooth animations
 */

import React, { useMemo } from 'react';
import { useLocation } from 'wouter';
import { LayoutGrid, FolderOpen, ShieldCheck, LineChart, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortal } from '../core/portalContext';
import type { ModuleId } from '../core/portalTypes';

// Primary modules for mobile nav
const mobileNavItems: Array<{
  moduleId: ModuleId;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  route: string;
}> = [
  {
    moduleId: 'dashboard',
    icon: LayoutGrid,
    label: 'Home',
    route: '/client-portal',
  },
  {
    moduleId: 'vault',
    icon: FolderOpen,
    label: 'Vault',
    route: '/client-portal/vault',
  },
  {
    moduleId: 'regulatory_intel',
    icon: ShieldCheck,
    label: 'Regulatory',
    route: '/client-portal/regulatory-intel',
  },
  {
    moduleId: 'analytics',
    icon: LineChart,
    label: 'Analytics',
    route: '/client-portal/analytics',
  },
];

interface MobileNavProps {
  onMenuClick?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ onMenuClick }) => {
  const [location, setLocation] = useLocation();
  const { experience } = usePortal();

  // Filter nav items based on accessible modules
  const visibleItems = useMemo(() => {
    return mobileNavItems.filter(item => experience.modules.includes(item.moduleId));
  }, [experience.modules]);

  // Determine active item
  const isActive = (route: string) => {
    if (route === '/client-portal') {
      return location === '/client-portal' || location === '/client-portal/';
    }
    return location.startsWith(route);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white lg:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {visibleItems.slice(0, 4).map(item => {
          const Icon = item.icon;
          const active = isActive(item.route);

          return (
            <button
              key={item.moduleId}
              onClick={() => setLocation(item.route)}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 transition-colors',
                active ? 'text-stone-600' : 'text-stone-500 hover:text-stone-700'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  active && 'bg-stone-100'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}

        {/* More menu button */}
        <button
          onClick={onMenuClick}
          className="flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-stone-500 transition-colors hover:text-stone-700"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full">
            <Menu className="h-5 w-5" />
          </div>
          <span className="text-xs font-medium">More</span>
        </button>
      </div>

      {/* Safe area padding for devices with home indicator */}
      <div className="h-safe-area-inset-bottom bg-white" />
    </nav>
  );
};
