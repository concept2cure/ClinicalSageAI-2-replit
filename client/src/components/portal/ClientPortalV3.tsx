/**
 * Client Portal V3
 *
 * The unified entry point for all V3 UI components.
 * Routes between Dashboard, Programs, Library, and RI Copilot.
 *
 * @version 3.0.0
 * @author Concept2Cure Engineering
 */

import React, { useState, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShellV3 } from '../layout/AppShellV3';
import { DashboardV3 } from '../dashboard/DashboardV3';
import { ProgramWorkbenchV3 } from '../program/ProgramWorkbenchV3';
import { EvidenceLibraryV3 } from '../library/EvidenceLibraryV3';
import { AIAssistantV3 } from '../ai/AIAssistantV3';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ViewId =
  | 'dashboard'
  | 'programs'
  | 'library'
  | 'assistant'
  | 'analytics'
  | 'calendar'
  | 'team'
  | 'settings'
  | 'help';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: number | string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE TRANSITION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════════

const pageVariants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: {
      duration: 0.2,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 w-48 bg-neutral-200 rounded-lg" />
    <div className="grid grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-neutral-200 rounded-xl" />
      ))}
    </div>
    <div className="h-64 bg-neutral-200 rounded-xl" />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMING SOON PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════════

const ComingSoonPlaceholder: React.FC<{ title: string }> = ({ title }) => (
  <motion.div
    className="flex flex-col items-center justify-center py-24"
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
  >
    <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center mb-6">
      <span className="text-4xl">🚀</span>
    </div>
    <h2 className="text-2xl font-bold text-neutral-900 mb-2">{title}</h2>
    <p className="text-neutral-500 text-center max-w-md">
      This feature is coming soon. We're working hard to bring you an amazing experience.
    </p>
  </motion.div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ClientPortalV3: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  const handleNavigate = useCallback((item: NavItem) => {
    const viewMap: Record<string, ViewId> = {
      dashboard: 'dashboard',
      programs: 'programs',
      library: 'library',
      assistant: 'assistant',
      analytics: 'analytics',
      calendar: 'calendar',
      team: 'team',
      settings: 'settings',
      help: 'help',
    };
    setActiveView(viewMap[item.id] || 'dashboard');
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardV3 />;
      case 'programs':
        return <ProgramWorkbenchV3 />;
      case 'library':
        return <EvidenceLibraryV3 className="h-[calc(100vh-8rem)]" />;
      case 'assistant':
        return <AIAssistantV3 className="h-[calc(100vh-8rem)]" />;
      case 'analytics':
        return <ComingSoonPlaceholder title="Analytics" />;
      case 'calendar':
        return <ComingSoonPlaceholder title="Calendar" />;
      case 'team':
        return <ComingSoonPlaceholder title="Team" />;
      case 'settings':
        return <ComingSoonPlaceholder title="Settings" />;
      case 'help':
        return <ComingSoonPlaceholder title="Help & Support" />;
      default:
        return <DashboardV3 />;
    }
  };

  return (
    <AppShellV3 activeItem={activeView} onNavigate={handleNavigate}>
      <Suspense fallback={<LoadingSkeleton />}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </Suspense>
    </AppShellV3>
  );
};

export default ClientPortalV3;
